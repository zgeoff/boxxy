import type { PullRequestRef, RoundCause, Settled } from '@boxxy/model';

// Why a review round runs, from the item's settled attempts, oldest first, across its retries.
// Only a review of the same pull request counts. `rework`: the latest settled attempt that is
// not a build is a review that asked for changes. `recheck`: any other return to review.
export function buildRoundCause(
  history: readonly Settled[],
  pullRequest: PullRequestRef | null,
): RoundCause {
  const reviews = history.filter(
    (settled) =>
      settled.phase === 'review' &&
      settled.outcome !== 'lost' &&
      isSamePullRequest(settled.pullRequest, pullRequest),
  );

  if (reviews.length === 0) {
    return 'first';
  }

  const latestOther = history.findLast((settled) => settled.phase !== 'build');

  return latestOther?.phase === 'review' && latestOther.outcome === 'changes-requested'
    ? 'rework'
    : 'recheck';
}

function isSamePullRequest(
  first: PullRequestRef | null | undefined,
  second: PullRequestRef | null,
): boolean {
  return (
    first !== undefined &&
    first !== null &&
    second !== null &&
    first.repo === second.repo &&
    first.number === second.number
  );
}
