import type { AtcSessionId, AttemptRow, ItemId, KeptSession } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { timeouts } from '../timeouts.ts';
import { buildKeptClear } from './build-kept-clear.ts';
import { isKeptDue } from './is-kept-due.ts';
import type { ForgetReport, ForgetSessionsInput, UnreadStray } from './types.ts';

const hourMs = 3_600_000;

// The cleanup of one runner tick: the sessions of settled attempts that are not kept, and the
// kept sessions that are due. A forget the worker does not confirm changes nothing and is tried
// again on the next tick.
export async function forgetSessions(input: ForgetSessionsInput): Promise<ForgetReport> {
  const cutoff = brandSchemas.instant.parse(
    Math.max(0, input.now - timeouts.failedSessionHours * hourMs),
  );

  const strayCutoff = brandSchemas.instant.parse(
    Math.max(0, input.now - timeouts.strayHours * hourMs),
  );

  const rows = await input.store.read(async (tx) => ({
    kept: await tx.listKeptSessions(),
    due: await tx.listSessionsToForget(cutoff, strayCutoff),
  }));

  const kept = rows.kept;
  const due = rows.due;
  const forgotten: AtcSessionId[] = [];
  const failed: AtcSessionId[] = [];
  const unread: UnreadStray[] = [];

  for (const entry of kept) {
    const isDue = await input.store.read(async (tx) =>
      isKeptDue({
        kept: entry.kept,
        item: await tx.readItem(entry.item, input.now, input.rules),
        latest: await tx.findAttemptBySession(entry.kept.atcSession),
        now: input.now,
      }),
    );

    if (isDue) {
      const done = await forgetKept(input, entry.item, entry.kept);

      (done ? forgotten : failed).push(entry.kept.atcSession);
    }
  }

  for (const attempt of due) {
    const result = await forgetAttempt(input, attempt);

    if (result.kind === 'unread') {
      unread.push({ attempt: attempt.id, error: result.error });
    } else if (result.session !== null) {
      (result.kind === 'done' ? forgotten : failed).push(result.session);
    }
  }

  return { forgotten, failed, unread };
}

async function forgetKept(
  input: ForgetSessionsInput,
  item: ItemId,
  kept: KeptSession,
): Promise<boolean> {
  const outcome = await input.worker.forget(kept.atcSession);

  if (outcome.kind !== 'forgotten' && outcome.kind !== 'absent') {
    return false;
  }

  await input.store.exclusive(async (tx) => {
    const moved = await writeAttemptMove(
      tx,
      kept.attempt,
      { kind: 'session-forgotten' },
      { ...buildBase(input), also: [buildKeptClear(item, kept)] },
    );

    if (moved.kind !== 'applied') {
      await tx.applyChange({
        at: input.now,
        writes: [buildKeptClear(item, kept)],
        facts: [],
      });
    }
  });

  return true;
}

function buildBase(input: ForgetSessionsInput) {
  return { actor: input.actor, now: input.now, newId: input.newId };
}

interface SessionUnread {
  readonly kind: 'unread';
  readonly error: unknown;
}

type AttemptForget =
  | { readonly kind: 'done' | 'failed'; readonly session: AtcSessionId | null }
  | SessionUnread;

// atc refuses the forget of a live session, so a stray whose stop the runner never confirmed is
// stopped first, and the confirmed stop is recorded before the forget.
async function forgetAttempt(
  input: ForgetSessionsInput,
  attempt: AttemptRow,
): Promise<AttemptForget> {
  const isStray = attempt.strayedAt !== null && attempt.sessionStoppedAt === null;

  const read = await readAttemptSession(input, attempt);

  if (read.kind === 'unread') {
    return read;
  }

  const session = read.session;

  if (isStray && session !== null) {
    const stop = await input.worker.stop({ ...attempt, atcSession: session });

    if (stop.kind !== 'stopped' && stop.kind !== 'absent') {
      return { kind: 'failed', session };
    }
  }

  if (session !== null) {
    const outcome = await input.worker.forget(session);

    if (outcome.kind !== 'forgotten' && outcome.kind !== 'absent') {
      return { kind: 'failed', session };
    }
  }

  await input.store.exclusive(async (tx) => {
    if (isStray) {
      await writeAttemptMove(
        tx,
        attempt.id,
        { kind: 'stray-stopped', atcSession: session },
        buildBase(input),
      );
    }

    await writeAttemptMove(tx, attempt.id, { kind: 'session-forgotten' }, buildBase(input));
  });

  return { kind: 'done', session };
}

interface SessionRead {
  readonly kind: 'read';

  // null: no session appeared in the stray window, so none is left to stop
  readonly session: AtcSessionId | null;
}

// Only a stray whose spawn got no answer lacks a session; the worker finds it by the spawn name.
// That lookup throws when atc gives no answer, and one lost answer must not end the tick's cleanup.
async function readAttemptSession(
  input: ForgetSessionsInput,
  attempt: AttemptRow,
): Promise<SessionRead | SessionUnread> {
  if (attempt.atcSession !== null) {
    return { kind: 'read', session: attempt.atcSession };
  }

  try {
    const reading = await input.worker.reconcile(attempt);

    return { kind: 'read', session: reading.kind === 'absent' ? null : reading.atcSession };
  } catch (error) {
    return { kind: 'unread', error };
  }
}
