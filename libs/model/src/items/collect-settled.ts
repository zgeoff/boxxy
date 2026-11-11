import type { Settled } from '../pipeline/types.ts';
import type { AttemptRow } from '../types.ts';

// the settled attempts, oldest end first
export function collectSettled(attempts: readonly AttemptRow[]): Settled[] {
  const settled = attempts.flatMap((attempt) =>
    attempt.endedAt === null || attempt.outcome === null
      ? []
      : [
          {
            phase: attempt.phase,
            outcome: attempt.outcome,
            endedAt: attempt.endedAt,
            failure: attempt.failure,
          },
        ],
  );

  return settled.toSorted((first, second) => first.endedAt - second.endedAt);
}
