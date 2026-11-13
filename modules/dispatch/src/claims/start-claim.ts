import type { ActorRef, RunnerFault, StartOutcome } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { match } from 'ts-pattern';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import { resumeKeptSession } from '../sessions/resume-kept-session.ts';
import { timeouts } from '../timeouts.ts';
import type { StartClaimInput } from './types.ts';
import { writeStartedSession } from './write-started-session.ts';

const secondMs = 1000;

// Starts the claim's session outside the store lock, and records the worker's answer. A refusal
// for capacity settles `no-capacity` and holds the pool back. Returns the refusal, the fault of an
// agent session that another attempt holds, or null.
export async function startClaim(input: StartClaimInput): Promise<RunnerFault | null> {
  const attempt = input.claim.attempt;
  const actor: ActorRef = `boxxy:runner:${attempt.runner}`;
  const base = { actor, now: input.now, newId: input.newId };
  const pick = input.claim.kept;
  const kept = pick.kind === 'kept' ? pick.session : null;

  // a claim that wants a kept session and finds none starts fresh, as a fallback
  const woken =
    kept === null
      ? {
          outcome: await input.worker.start(input.claim.spawn),
          resumeFallback: pick.kind === 'gone',
        }
      : await resumeKeptSession(input.worker, kept, input.claim.spawn);

  return match<StartOutcome, Promise<RunnerFault | null>>(woken.outcome)
    .with({ kind: 'started' }, (started) =>
      input.store.exclusive((tx) =>
        writeStartedSession(
          tx,
          attempt,
          {
            via: 'start',
            atcSession: started.atcSession,
            agentSession: started.agentSession,
            caller: started.caller,
            kept,
            resumeFallback: woken.resumeFallback,
          },
          base,
        ),
      ),
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

        // a session recorded since, by another start of the same attempt, keeps it alive
        seen: { atcSession: attempt.atcSession },
        rules: input.rules,
      });

      return {
        kind: 'fault',
        fault: 'spawn-refused',
        attempt: attempt.id,
        item: attempt.item,
        cause: refused.cause,
        reason: refused.reason,
      };
    })
    .exhaustive();
}
