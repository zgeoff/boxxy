import type { PullRequestLink, PullRequestRow } from '@boxxy/model';

// The item's latest pull request, which a build of a later round pushes to and the review reads.
export function findPullRequestLink(
  pullRequests: readonly PullRequestRow[],
): PullRequestLink | null {
  const latest = pullRequests.at(-1);

  return latest === undefined
    ? null
    : { repo: latest.repo, number: latest.number, url: latest.url };
}
