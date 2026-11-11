import type { ActorRef, SessionFault } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { writeSessionBind } from '../attempts/write-session-bind.ts';
import { timeouts } from '../timeouts.ts';
import type { ResumeClaimInput } from './types.ts';

const secondMs = 1000;

// Resumes a woken attempt's session outside the store lock. A refusal for capacity sleeps it
// again with its request and holds its pool back, so no claim of the tick picks it again; any
// other answer but `started` leaves it `waking` for the reading to retry.
export async function resumeClaim(input: ResumeClaimInput): Promise<SessionFault | null> {
  const attempt = input.claim.attempt;
  const actor: ActorRef = `boxxy:runner:${attempt.runner}`;
  const base = { actor, now: input.now, newId: input.newId };

  const outcome = await input.worker.resume(attempt);

  if (outcome.kind === 'refused' && outcome.cause === 'capacity') {
    input.backoff.hold(
      attempt.pool,
      brandSchemas.instant.parse(input.now + timeouts.capacityBackoffSeconds * secondMs),
    );

    await input.store.exclusive((tx) =>
      writeAttemptMove(tx, attempt.id, { kind: 'wake-refused' }, base),
    );

    return null;
  }

  if (outcome.kind !== 'started') {
    return null;
  }

  return input.store.exclusive(async (tx) => {
    const moved = await writeAttemptMove(
      tx,
      attempt.id,
      { kind: 'resumed', atcSession: outcome.atcSession, caller: outcome.caller },
      base,
    );

    const row = await tx.readAttempt(attempt.id);

    return moved.kind === 'applied' && row !== null && outcome.agentSession !== null
      ? writeSessionBind(
          tx,
          row,
          { atcSession: outcome.atcSession, agentSession: outcome.agentSession },
          base,
        )
      : null;
  });
}
