import type { RoundCause, Settled } from '@boxxy/model';

// Why a review round runs, from the item's settled attempts since its latest retry, oldest
// first. `rework`: the latest settled attempt that is not a build is a review that asked for
// changes. `recheck`: the item came back from another phase, or the last review failed.
export function buildRoundCause(history: readonly Settled[]): RoundCause {
  const reviews = history.filter(
    (settled) => settled.phase === 'review' && settled.outcome !== 'lost',
  );

  if (reviews.length === 0) {
    return 'first';
  }

  const latestOther = history.findLast((settled) => settled.phase !== 'build');

  return latestOther?.phase === 'review' && latestOther.outcome === 'changes-requested'
    ? 'rework'
    : 'recheck';
}
