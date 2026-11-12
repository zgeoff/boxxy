import type { AttemptId } from '@boxxy/model';
import { ControlConflictError } from './control-conflict-error.ts';
import type { VerifyHarness } from './types.ts';

// Marks the session's turn as ended on the fake worker, then runs two ticks: the first stops the
// session, and the second settles the attempt.
export async function endTurn(harness: VerifyHarness, attempt: AttemptId) {
  harness.server.dispatch.worker.setSession(attempt, {
    state: 'running',
    attention: 'turn-ended',
  });

  await harness.server.tick();
  await harness.server.tick();

  const settled = await harness.server.dispatch.readAttempt(attempt);

  if (settled.state !== 'succeeded' && settled.state !== 'failed') {
    throw new ControlConflictError(
      `the attempt is ${settled.state} after two ticks: it did not settle`,
    );
  }

  return {
    id: settled.id,
    phase: settled.phase,
    state: settled.state,
    outcome: settled.outcome,
  };
}
