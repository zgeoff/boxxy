import type { ContentHash } from '@boxxy/content-hash';
import { contentHash } from '@boxxy/content-hash';
import type { AttemptRow, CloseOutAnswer, FactId, StoreChange, StoreTx } from '@boxxy/model';
import { closeOutSchema, toJSONValue } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildAttemptChange } from '../attempts/build-attempt-change.ts';
import { pickCallAttempt } from '../attempts/pick-call-attempt.ts';
import { readCloseOutContext } from './read-close-out-context.ts';
import type { CallRef, CloseOutInput } from './types.ts';

// Records an attempt's close-out, in one store lock. The session check runs before the body is
// read. The hash covers the body the session sent, so its repeat is a repeat even when the
// server built the stored body from it.
export function closeOutAttempt(input: CloseOutInput): Promise<CloseOutAnswer> {
  return input.store.exclusive(async (tx) => {
    const latest = await tx.findAttemptBySession(input.call.session);

    const start = pickCloseOutStart(latest, input.call, input.sent ?? input.body);

    if (start.kind === 'answer') {
      return start.answer;
    }

    return writeCloseOut(tx, input, start.attempt, start.hash);
  });
}

export type CloseOutStart =
  | { readonly kind: 'answer'; readonly answer: CloseOutAnswer }
  | { readonly kind: 'open'; readonly attempt: AttemptRow; readonly hash: ContentHash };

// The checks of a close-out call that come before its body is read: the session, the hash of the
// body the session sent, a repeat of a stored close-out, and the attempt's state. Pure.
export function pickCloseOutStart(
  latest: AttemptRow | null,
  call: CallRef,
  sent: unknown,
): CloseOutStart {
  const found = pickCallAttempt(latest, call);

  if (found.kind === 'refused') {
    return { kind: 'answer', answer: found };
  }

  const attempt = found.attempt;

  // the body only: the phase is the attempt's
  const hash = buildBodyHash(sent);

  if (hash === null) {
    return {
      kind: 'answer',
      answer: {
        kind: 'rejected',
        problems: [{ kind: 'schema', path: '', message: 'the close-out is not valid JSON text' }],
      },
    };
  }

  if (attempt.closeOutHash === hash && attempt.closeOutFact !== null) {
    return {
      kind: 'answer',
      answer: { kind: 'recorded', attempt: attempt.id, factId: attempt.closeOutFact, repeat: true },
    };
  }

  if (attempt.state === 'closing' && attempt.closing === 'closed-out') {
    return { kind: 'answer', answer: { kind: 'refused', reason: 'already-closed-out' } };
  }

  if (attempt.state === 'closing' || attempt.state === 'succeeded' || attempt.state === 'failed') {
    return { kind: 'answer', answer: { kind: 'refused', reason: 'not-current' } };
  }

  return { kind: 'open', attempt, hash };
}

// null for a body that has no canonical JSON form, such as a string with a lone surrogate
function buildBodyHash(body: unknown): ContentHash | null {
  try {
    return contentHash(toJSONValue(body));
  } catch {
    return null;
  }
}

async function writeCloseOut(
  tx: StoreTx,
  input: CloseOutInput,
  attempt: AttemptRow,
  hash: ContentHash,
): Promise<CloseOutAnswer> {
  const phase = input.rules.phases.get(attempt.phase);

  // the phase left the rules after the claim: the attempt can no longer close out
  if (phase === undefined) {
    return { kind: 'refused', reason: 'not-current' };
  }

  const ctx = await readCloseOutContext(tx, attempt, input.rules, input.now);

  const parsed = phase.closeOut.parse(input.body, ctx);

  if (parsed.kind === 'invalid') {
    return { kind: 'rejected', problems: parsed.problems };
  }

  const closeOut = closeOutSchema.safeParse(parsed.closeOut);

  invariant(closeOut.success, `the phase kind ${attempt.phase} gives a close-out of a known shape`);

  const built = buildAttemptChange({
    attempt,
    event: { kind: 'closed-out', closeOut: closeOut.data, hash },
    actor: `boxxy:attempt:${attempt.id}`,
    now: input.now,
    newId: input.newId,
  });

  if (built.kind === 'not-allowed') {
    return { kind: 'refused', reason: 'not-current' };
  }

  const result = await tx.applyChange(built.change);

  return result.kind === 'applied'
    ? {
        kind: 'recorded',
        attempt: attempt.id,
        factId: getClosedOutFact(built.change),
        repeat: false,
      }
    : { kind: 'refused', reason: 'not-current' };
}

function getClosedOutFact(change: StoreChange): FactId {
  const fact = change.facts.find((candidate) => candidate.type === 'boxxy.attempt.closed_out');

  invariant(fact !== undefined, 'the closed-out move records its fact');

  return fact.id;
}
