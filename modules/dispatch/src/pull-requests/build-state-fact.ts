import type { ActorRef, AnyNewFact, FactId, ItemId, PullRequestRow } from '@boxxy/model';

export interface StateFactInput {
  readonly row: PullRequestRow;
  readonly item: ItemId;
  readonly actor: ActorRef;
  readonly id: FactId;
}

// The fact for a pull request row that is not open: its merge, or its close with no merge. An
// open row has none.
export function buildStateFact(input: StateFactInput): AnyNewFact | null {
  const row = input.row;

  const base = {
    id: input.id,
    entity: `boxxy:item:${input.item}`,
    actor: input.actor,
  } as const;

  const shared = {
    attempt: row.attempt,
    repo: row.repo,
    number: row.number,
    pullRequestId: String(row.githubId),
  };

  if (row.state === 'merged' && row.mergedAt !== null && row.mergeCommit !== null) {
    return {
      ...base,
      type: 'boxxy.pull_request.merged',
      payload: { ...shared, mergedAt: row.mergedAt, mergeCommit: row.mergeCommit },
    };
  }

  return row.state === 'closed'
    ? { ...base, type: 'boxxy.pull_request.closed', payload: shared }
    : null;
}
