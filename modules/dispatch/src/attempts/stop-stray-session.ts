import type {
  ActorRef,
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
  const outcome = await input.worker.stop(input.attempt);

  if (!isSessionGone(input.attempt, outcome)) {
    return null;
  }

  return input.store.exclusive((tx) =>
    writeAttemptMove(
      tx,
      input.attempt.id,
      { kind: 'stray-stopped' },
      { actor: input.actor, now: input.now, newId: input.newId },
    ),
  );
}

// An attempt with no session is looked for by its spawn name, so `absent` there means the session
// has not appeared yet, and the loop keeps sending the stop.
function isSessionGone(attempt: AttemptRow, outcome: StopOutcome): boolean {
  return outcome.kind === 'stopped' || (outcome.kind === 'absent' && attempt.atcSession !== null);
}
