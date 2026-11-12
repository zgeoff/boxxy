import type {
  ActorRef,
  AttemptRow,
  Instant,
  RunnerFault,
  SessionFault,
  SessionReading,
  StoreTx,
} from '@boxxy/model';
import { brandSchemas, isFilterMatch, spawnRequestSchema } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { isSameGuard } from '../attempts/is-same-guard.ts';
import type { MoveBase, MoveEvent } from '../attempts/types.ts';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { writeSessionBind } from '../attempts/write-session-bind.ts';
import { buildSnapshotHash } from '../claims/build-snapshot-hash.ts';
import { resumeClaim } from '../claims/resume-claim.ts';
import { startClaim } from '../claims/start-claim.ts';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import { timeouts } from '../timeouts.ts';
import type { ActOnReadingInput, ReadingAction } from './types.ts';

// Carries out the reconcile table's action for one reading, after it binds a new agent session
// that the reading shows. An action whose row moved on since the runner read it does nothing.
// Returns the faults of the bind and the action.
export async function actOnReading(input: ActOnReadingInput): Promise<RunnerFault[]> {
  const base: MoveBase = {
    actor: `boxxy:runner:${input.attempt.runner}` satisfies ActorRef,
    now: input.now,
    newId: input.newId,
  };

  const faults: RunnerFault[] = [];

  const bindFault = await writeReadingBind(input, base);

  if (bindFault !== null) {
    faults.push(bindFault);
  }

  await runAction(input, input.action, base, faults);

  return faults;
}

function writeReadingBind(input: ActOnReadingInput, base: MoveBase): Promise<SessionFault | null> {
  const reading = input.reading;

  if (reading.kind === 'absent' || reading.agentSession === null) {
    return Promise.resolve(null);
  }

  const agentSession = reading.agentSession;

  return input.store.exclusive(async (tx) => {
    const row = await tx.readAttempt(input.attempt.id);

    invariant(row !== null, `the runner read a stored attempt: ${input.attempt.id}`);

    return writeSessionBind(tx, row, { atcSession: reading.atcSession, agentSession }, base);
  });
}

const hourMs = 3_600_000;

function runAction(
  input: ActOnReadingInput,
  action: ReadingAction,
  base: MoveBase,
  faults: RunnerFault[],
) {
  const id = input.attempt.id;
  const seen = { ...base, seen: input.attempt };

  const writeMove = (event: MoveEvent) =>
    input.store.exclusive((tx) => writeAttemptMove(tx, id, event, seen));

  return match(action)
    .with({ kind: 'nothing' }, { kind: 'bind-only' }, { kind: 'await-spawn' }, async () => {})
    .with({ kind: 'move-to-running', via: 'reconcile' }, async () => {
      const running = getRunningReading(input.reading);

      await writeMove({
        kind: 'started',
        via: 'reconcile',
        atcSession: running.atcSession,
        caller: running.caller,
        resumeFallback: false,
      });
    })
    .with({ kind: 'move-to-running', via: 'resume' }, async () => {
      const running = getRunningReading(input.reading);

      await writeMove({ kind: 'resumed', atcSession: running.atcSession, caller: running.caller });
    })
    .with({ kind: 'respawn' }, async () => {
      if (!(await probeSeenRow(input))) {
        return;
      }

      const fault = await startClaim({
        ...input,
        claim: {
          kind: 'start',
          attempt: input.attempt,
          spawn: spawnRequestSchema.parse(input.attempt.spawnRequest),
          kept: null,
        },
      });

      if (fault !== null) {
        faults.push(fault);
      }
    })
    .with({ kind: 'clear-mark' }, async () => {
      await writeMove({ kind: 'suspend-refused' });
    })
    .with({ kind: 'sleep-if-idle' }, (sleep) =>
      runSleepSteps(input, base, {
        ifIdleSince: sleep.waitingSince,
        idleSince: sleep.waitingSince,
      }),
    )
    .with({ kind: 'sleep-unattended' }, (sleep) =>
      runSleepSteps(input, base, { ifIdleSince: null, idleSince: sleep.since }),
    )
    .with({ kind: 'sleep' }, (sleep) =>
      input.store.exclusive(async (tx) => {
        const moved = await writeAttemptMove(
          tx,
          id,
          {
            kind: 'slept',
            idleSince: input.attempt.suspendRequestedAt ?? input.now,
            asked: !sleep.requestWake,
          },
          seen,
        );

        // the host slept with no request, so the attempt wakes by itself
        if (moved.kind === 'applied' && sleep.requestWake) {
          await writeAttemptMove(
            tx,
            id,
            { kind: 'wake-requested', by: 'host-slept-unasked' },
            base,
          );
        }
      }),
    )
    .with({ kind: 'request-wake' }, async (wake) => {
      await writeMove({ kind: 'wake-requested', by: wake.by });
    })
    .with({ kind: 'wake-over-cap' }, () =>
      input.store.exclusive((tx) => writeWakeOverCap(tx, input, base)),
    )
    .with({ kind: 'resume' }, async () => {
      if (!(await probeSeenRow(input))) {
        return;
      }

      const fault = await resumeClaim({
        ...input,
        claim: { kind: 'wake', attempt: input.attempt },
      });

      if (fault !== null) {
        faults.push(fault);
      }
    })
    .with({ kind: 'close', cause: 'timed-out' }, async (close) => {
      await writeMove({ kind: 'timed-out', afterMinutes: close.afterMinutes });
    })
    .with({ kind: 'close', cause: 'turn-ended' }, async () => {
      await writeMove({ kind: 'turn-ended' });
    })
    .with({ kind: 'close', cause: 'stalled' }, async () => {
      await writeMove({ kind: 'stalled' });
    })
    .with({ kind: 'close', cause: 'usage-limit' }, async (close) => {
      const latest = input.now + timeouts.usageLimitBackoffHours * hourMs;

      // the worker adapter sends the time it saw the limit when atc gives no reset time
      const until = close.resetsAt > input.now ? Math.min(close.resetsAt, latest) : latest;

      const moved = await writeMove({ kind: 'usage-limited' });

      if (moved.kind === 'applied') {
        input.backoff.hold(input.attempt.pool, brandSchemas.instant.parse(until));
      }
    })
    .with({ kind: 'stop' }, () => runStop(input, base))
    .with({ kind: 'settle' }, async (settle) => {
      await settleAttempt({
        ...base,
        store: input.store,
        attempt: id,
        forced: settle.forced,
        sessionStopped: settle.sessionStopped,
        seen: input.attempt,
        rules: input.rules,
      });
    })
    .exhaustive();
}

function getRunningReading(reading: SessionReading) {
  invariant(
    reading.kind === 'running',
    'the table moves an attempt to running on a running reading',
  );

  return reading;
}

// The worker call of a respawn or a resume runs outside the lock, so it checks the row first: a
// row that moved since the reading makes the call wait for the next tick.
async function probeSeenRow(input: ActOnReadingInput): Promise<boolean> {
  const row = await readRow(input);

  return isSameGuard(input.attempt, row);
}

function readRow(input: ActOnReadingInput): Promise<AttemptRow> {
  return input.store.read(async (tx) => {
    const row = await tx.readAttempt(input.attempt.id);

    invariant(row !== null, `the runner read a stored attempt: ${input.attempt.id}`);

    return row;
  });
}

interface SleepTimes {
  // null: suspend with no idle check
  readonly ifIdleSince: Instant | null;
  readonly idleSince: Instant;
}

// The mark, the suspend outside the lock, then `slept`, which releases the seats. A crash, or an
// unknown answer, leaves the mark, and the next reading clears it or sleeps the attempt.
async function runSleepSteps(
  input: ActOnReadingInput,
  base: MoveBase,
  times: SleepTimes,
): Promise<void> {
  const id = input.attempt.id;

  const marked = await input.store.exclusive((tx) =>
    writeAttemptMove(tx, id, { kind: 'suspend-asked' }, { ...base, seen: input.attempt }),
  );

  if (marked.kind !== 'applied') {
    return;
  }

  const row = await readRow(input);
  const outcome = await input.worker.suspend(row, times.ifIdleSince);

  if (outcome.kind === 'unknown') {
    return;
  }

  const event: MoveEvent =
    outcome.kind === 'suspended'
      ? { kind: 'slept', idleSince: times.idleSince, asked: true }
      : { kind: 'suspend-refused' };

  await input.store.exclusive((tx) => writeAttemptMove(tx, id, event, { ...base, seen: row }));
}

// The owner revived the session and no seat came free in time: the attempt takes its seats past
// the cap, with no resume, because the session runs already. The decision row records each
// limit's count and max at that moment.
async function writeWakeOverCap(tx: StoreTx, input: ActOnReadingInput, base: MoveBase) {
  const row = await tx.readAttempt(input.attempt.id);

  invariant(row !== null, `the runner read a stored attempt: ${input.attempt.id}`);

  const limits = await tx.listLimits();

  const counting = limits.filter((limit) => isFilterMatch(limit.counts, row.fields));

  const snapshot = await tx.readSnapshot(input.now, input.rules);

  return writeAttemptMove(
    tx,
    row.id,
    {
      kind: 'woken',
      pick: { kind: 'wake', attempt: row.id, limits: counting.map((limit) => limit.name) },
      decision: {
        item: row.item,
        kind: 'wake',
        pool: row.pool,
        rulesVersion: input.rules.version,
        snapshotHash: buildSnapshotHash(snapshot, input.backoff.listHeld(input.now)),
        storeVersion: snapshot.storeVersion,
        pepysOffsets: {},
        faults: [],
        limits: counting.map((limit) => ({ limit: limit.name, held: limit.held, max: limit.max })),
      },
      overCap: true,
    },
    { ...base, seen: input.attempt },
  );
}

// A closing attempt whose spawn landed after its item closed records the session first, so the
// stop reaches it. The stop's answer moves nothing: the next reading settles a stopped session.
async function runStop(input: ActOnReadingInput, base: MoveBase): Promise<void> {
  const reading = input.reading;

  if (input.attempt.atcSession === null && reading.kind === 'running') {
    const moved = await input.store.exclusive((tx) =>
      writeAttemptMove(
        tx,
        input.attempt.id,
        {
          kind: 'started',
          via: 'start',
          atcSession: reading.atcSession,
          caller: reading.caller,
          resumeFallback: false,
        },
        { ...base, seen: input.attempt },
      ),
    );

    if (moved.kind !== 'applied') {
      return;
    }
  } else if (!(await probeSeenRow(input))) {
    return;
  }

  const row = await readRow(input);

  await input.worker.stop(row);
}
