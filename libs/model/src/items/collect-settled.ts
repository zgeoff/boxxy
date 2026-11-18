import { reviewInputSchema } from '../closeouts/review-input-schema.ts';
import type { Settled } from '../pipeline/types.ts';
import type { AttemptRow, PullRequestRef } from '../types.ts';

// the settled attempts, oldest end first
export function collectSettled(attempts: readonly AttemptRow[]): Settled[] {
  const settled = attempts.flatMap((attempt): Settled[] =>
    attempt.endedAt === null || attempt.outcome === null
      ? []
      : [
          {
            phase: attempt.phase,
            outcome: attempt.outcome,
            endedAt: attempt.endedAt,
            failure: attempt.failure,
            ...(attempt.phase === 'review' ? { pullRequest: parseReviewPullRequest(attempt) } : {}),
          },
        ],
  );

  return settled.toSorted((first, second) => first.endedAt - second.endedAt);
}

function parseReviewPullRequest(attempt: AttemptRow): PullRequestRef | null {
  const parsed = reviewInputSchema.safeParse(attempt.input);

  return parsed.success ? parsed.data.pullRequest : null;
}
