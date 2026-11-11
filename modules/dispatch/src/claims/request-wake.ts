import type { MoveResult } from '../attempts/types.ts';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import type { RequestWakeInput } from './types.ts';

// The one way to ask for a wake: `boxxy item wake`, a session that runs while its attempt
// sleeps, and a host that slept with no request all end here. The next claim seats the attempt
// and resumes it. A second request, or an attempt that does not sleep, is `not-allowed`.
export function requestWake(input: RequestWakeInput): Promise<MoveResult> {
  return input.store.exclusive((tx) =>
    writeAttemptMove(
      tx,
      input.attempt,
      { kind: 'wake-requested', by: input.by },
      { actor: input.actor, now: input.now, newId: input.newId },
    ),
  );
}
