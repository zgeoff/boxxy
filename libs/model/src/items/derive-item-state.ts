import type { AttemptRow, DerivedState, ItemRow, ItemRows } from '../types.ts';

interface StateInput {
  readonly item: ItemRow;
  readonly rows: ItemRows;

  // the succeeded and failed attempts that ended after the item's latest `item.retry` lever
  readonly counted: readonly AttemptRow[];
}

interface StateRule {
  readonly derived: DerivedState;
  readonly holds: (input: StateInput) => boolean;
}

const stateRules: readonly StateRule[] = [
  { derived: { state: 'archived' }, holds: (input) => input.item.closedAt !== null },
  { derived: { state: 'done' }, holds: (input) => hasMergedPullRequest(input.rows) },
  { derived: { state: 'running' }, holds: (input) => input.rows.liveLease !== null },
  { derived: { state: 'waiting', reason: 'pull request open' }, holds: hasOpenPullRequest },
  {
    derived: { state: 'waiting', reason: 'no pull request linked' },
    holds: hasSucceededWithoutPullRequest,
  },
  { derived: { state: 'waiting', reason: 'attempts used up' }, holds: hasUsedUpAttempts },
  { derived: { state: 'idea' }, holds: (input) => input.item.acceptance.length === 0 },
  { derived: { state: 'blocked' }, holds: (input) => hasOpenBlocker(input.rows) },
];

export function deriveItemState(item: ItemRow, rows: ItemRows): DerivedState {
  const input = { item, rows, counted: collectCountedAttempts(rows) };

  return stateRules.find((rule) => rule.holds(input))?.derived ?? { state: 'ready' };
}

function collectCountedAttempts(rows: ItemRows): AttemptRow[] {
  const retryAt = Math.max(
    Number.NEGATIVE_INFINITY,
    ...rows.levers.filter((lever) => lever.kind === 'item.retry').map((lever) => lever.at),
  );

  return rows.attempts.filter((attempt) => attempt.endedAt !== null && attempt.endedAt > retryAt);
}

function hasMergedPullRequest(rows: ItemRows): boolean {
  const succeeded = new Set(collectSucceeded(rows.attempts).map((attempt) => attempt.id));

  return rows.pullRequests.some(
    (pullRequest) => pullRequest.state === 'merged' && succeeded.has(pullRequest.attempt),
  );
}

function collectSucceeded(attempts: readonly AttemptRow[]): AttemptRow[] {
  return attempts.filter((attempt) => attempt.state === 'succeeded');
}

function hasOpenPullRequest(input: StateInput): boolean {
  const succeeded = new Set(collectSucceeded(input.counted).map((attempt) => attempt.id));

  return input.rows.pullRequests.some(
    (pullRequest) => pullRequest.state === 'open' && succeeded.has(pullRequest.attempt),
  );
}

function hasSucceededWithoutPullRequest(input: StateInput): boolean {
  const linked = new Set(input.rows.pullRequests.map((pullRequest) => pullRequest.attempt));

  return collectSucceeded(input.counted).some((attempt) => !linked.has(attempt.id));
}

function hasUsedUpAttempts(input: StateInput): boolean {
  const failed = input.counted.filter((attempt) => attempt.state === 'failed');

  return failed.length >= input.rows.maxAttempts;
}

function hasOpenBlocker(rows: ItemRows): boolean {
  return rows.relations.some((relation) => {
    const blockerState = rows.blockerStates.get(relation.source);

    return relation.type === 'blocks' && blockerState !== 'done' && blockerState !== 'archived';
  });
}
