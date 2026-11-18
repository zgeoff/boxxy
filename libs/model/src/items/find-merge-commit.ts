import type { AttemptRow, CommitSha, PullRequestRow } from '../types.ts';
import { collectBuildPullRequests } from './collect-build-pull-requests.ts';

// The merge commit of the latest merged pull request, by `mergedAt`, among those linked to the
// item's succeeded builds; null when none has merged.
export function findMergeCommit(
  attempts: readonly AttemptRow[],
  pullRequests: readonly PullRequestRow[],
): CommitSha | null {
  let latest: PullRequestRow | null = null;

  for (const pullRequest of collectBuildPullRequests(attempts, pullRequests)) {
    if (
      pullRequest.state === 'merged' &&
      pullRequest.mergedAt !== null &&
      pullRequest.mergeCommit !== null &&
      (latest === null || (latest.mergedAt ?? 0) < pullRequest.mergedAt)
    ) {
      latest = pullRequest;
    }
  }

  return latest?.mergeCommit ?? null;
}
