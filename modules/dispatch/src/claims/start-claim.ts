import type { ActorRef, RunnerFault, StartOutcome } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { match } from 'ts-pattern';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { writeSessionBind } from '../attempts/write-session-bind.ts';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import { buildKeptClear } from '../sessions/build-kept-clear.ts';
import { resumeKeptSession } from '../sessions/resume-kept-session.ts';
import { timeouts } from '../timeouts.ts';
import type { StartClaimInput } from './types.ts';

const secondMs = 1000;

// Starts the claim's session outside the store lock, and records the worker's answer. A refusal
// for capacity settles `no-capacity` and holds the pool back. Returns the refusal, the fault of an
// agent session that another attempt holds, or null.
export async function startClaim(input: StartClaimInput): Promise<RunnerFault | null> {
  const attempt = input.claim.attempt;
  const actor: ActorRef = `boxxy:runner:${attempt.runner}`;
  const base = { actor, now: input.now, newId: input.newId };
  const kept = input.claim.kept;

  const woken =
    kept === null
      ? { outcome: await input.worker.start(input.claim.spawn), resumeFallback: false }
      : await resumeKeptSession(input.worker, kept, input.claim.spawn);

  const outcome = woken.outcome;
  const resumeFallback = woken.resumeFallback;
  const keptClear = kept === null ? [] : [buildKeptClear(attempt.item, kept)];

  return match<StartOutcome, Promise<RunnerFault | null>>(outcome)
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
            resumeFallback,
          },
          { ...base, also: keptClear },
        );

        const row = await tx.readAttempt(attempt.id);

        return moved.kind === 'applied' && row !== null && started.agentSession !== null
          ? writeSessionBind(
              tx,
              row,
              {
                atcSession: started.atcSession,
                agentSession: started.agentSession,
                keptFrom: resumeFallback || kept === null ? null : kept.attempt,
              },
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
