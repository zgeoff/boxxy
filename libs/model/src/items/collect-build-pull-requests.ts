import type { AttemptRow, PullRequestRow } from '../types.ts';
import { buildPhase } from './constants.ts';

// the pull requests linked to a succeeded build attempt
export function collectBuildPullRequests(
  attempts: readonly AttemptRow[],
  pullRequests: readonly PullRequestRow[],
): PullRequestRow[] {
  const succeededBuilds = new Set(
    attempts
      .filter((attempt) => attempt.phase === buildPhase && attempt.state === 'succeeded')
      .map((attempt) => attempt.id),
  );

  return pullRequests.filter((pullRequest) => succeededBuilds.has(pullRequest.attempt));
}
