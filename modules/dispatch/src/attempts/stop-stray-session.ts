import type {
  ActorRef,
  AtcSessionId,
  AttemptRow,
  ClaimStore,
  Instant,
  NewId,
  StopOutcome,
  WorkerKind,
} from '@boxxy/model';
import type { MoveResult } from './types.ts';
import { writeAttemptMove } from './write-attempt-move.ts';

export interface StopStraySessionInput {
  readonly store: ClaimStore;
  readonly worker: WorkerKind;

  // an attempt that the give-up rule settled while its session still ran
  readonly attempt: AttemptRow;
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

// Sends the stop again, and records `stray-stopped` once the session is gone. The runner calls
// it on every tick for each stray, so a stop that fails is tried again on the next tick. null:
// the session still runs, or it never appeared.
export async function stopStraySession(input: StopStraySessionInput): Promise<MoveResult | null> {
  const found = await readStraySession(input);

  if (found === null) {
    return null;
  }

  const outcome = await input.worker.stop({ ...input.attempt, atcSession: found });

  if (!isSessionGone(outcome)) {
    return null;
  }

  return input.store.exclusive((tx) =>
    writeAttemptMove(
      tx,
      input.attempt.id,
      { kind: 'stray-stopped', atcSession: found },
      { actor: input.actor, now: input.now, newId: input.newId },
    ),
  );
}

// An attempt whose item closed while its spawn was in flight has no session. The worker looks for
// it by its spawn name, and the stop records what it finds, so cleanup can forget the session.
// null: the session has not appeared yet.
async function readStraySession(input: StopStraySessionInput): Promise<AtcSessionId | null> {
  if (input.attempt.atcSession !== null) {
    return input.attempt.atcSession;
  }

  const reading = await input.worker.reconcile(input.attempt);

  return reading.kind === 'absent' ? null : reading.atcSession;
}

function isSessionGone(outcome: StopOutcome): boolean {
  return outcome.kind === 'stopped' || outcome.kind === 'absent';
}
