import type { ActorRef, SessionFault, StartOutcome } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { match } from 'ts-pattern';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { writeSessionBind } from '../attempts/write-session-bind.ts';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import { timeouts } from '../timeouts.ts';
import type { StartClaimInput } from './types.ts';

const secondMs = 1000;

// Starts the claim's session outside the store lock, and records the worker's answer. A refusal
// for capacity settles `no-capacity` and holds the pool back. Returns the fault of an agent
// session that another attempt holds, or null.
export async function startClaim(input: StartClaimInput): Promise<SessionFault | null> {
  const attempt = input.claim.attempt;
  const actor: ActorRef = `boxxy:runner:${attempt.runner}`;
  const base = { actor, now: input.now, newId: input.newId };

  const outcome = await input.worker.start(input.claim.spawn);

  return match<StartOutcome, Promise<SessionFault | null>>(outcome)
    .with({ kind: 'started' }, (started) =>
      input.store.exclusive(async (tx) => {
        const moved = await writeAttemptMove(
          tx,
          attempt.id,
          {
            kind: 'started',
            via: 'start',
            atcSession: started.atcSession,
            caller: started.caller,
            resumeFallback: false,
          },
          base,
        );

        const row = await tx.readAttempt(attempt.id);

        return moved.kind === 'applied' && row !== null && started.agentSession !== null
          ? writeSessionBind(
              tx,
              row,
              { atcSession: started.atcSession, agentSession: started.agentSession },
              base,
            )
          : null;
      }),
    )
    .with({ kind: 'unknown' }, async (unknown) => {
      await input.store.exclusive((tx) =>
        writeAttemptMove(
          tx,
          attempt.id,
          { kind: 'spawn-unanswered', reason: unknown.reason },
          base,
        ),
      );

      return null;
    })
    .with({ kind: 'refused' }, async (refused) => {
      if (refused.cause === 'capacity') {
        input.backoff.hold(
          attempt.pool,
          brandSchemas.instant.parse(input.now + timeouts.capacityBackoffSeconds * secondMs),
        );
      }

      await settleAttempt({
        ...base,
        store: input.store,
        attempt: attempt.id,
        forced: refused.cause === 'capacity' ? 'no-capacity' : 'spawn-refused',
        sessionStopped: true,
        rules: input.rules,
      });

      return null;
    })
    .exhaustive();
}
