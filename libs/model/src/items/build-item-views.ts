import { findPosition } from '../pipeline/find-position.ts';
import type { Position, RetryLever, Settled } from '../pipeline/types.ts';
import type { ItemRules } from '../rules/types.ts';
import type {
  AttemptId,
  AttemptRow,
  DerivedState,
  Instant,
  ItemId,
  ItemRow,
  ItemState,
  LeaseRow,
  LeverRow,
  PullRequestRow,
  RelationRow,
} from '../types.ts';
import { deriveItemState } from './derive-item-state.ts';
import { liveLevers } from './live-levers.ts';
import type { ItemSetRows, ItemWithLevers } from './types.ts';

export function buildItemViews(
  rows: ItemSetRows,
  now: Instant,
  rules: ItemRules,
): ItemWithLevers[] {
  const groups = collectItemGroups(rows, now, rules);

  // A blocking source counts only when it is done or archived, and no relation makes an item either,
  // so each source's state derived without its relations settles its targets.
  const ownStates = new Map<ItemId, ItemState>(
    groups.map((group) => [
      group.item.id,
      deriveGroupState(group, rules, { relations: [], blockerStates: new Map() }).state,
    ]),
  );

  return groups.map((group) =>
    buildItemWithLevers(
      group,
      deriveGroupState(group, rules, { relations: group.relations, blockerStates: ownStates }),
      now,
    ),
  );
}

interface ItemGroup {
  readonly item: ItemRow;
  readonly relations: RelationRow[];
  readonly attempts: AttemptRow[];
  readonly pullRequests: PullRequestRow[];
  readonly levers: LeverRow[];
  liveLease: LeaseRow | null;
  position: Position;
}

// in the order of `rows.items`
function collectItemGroups(rows: ItemSetRows, now: Instant, rules: ItemRules): ItemGroup[] {
  const groups = new Map<ItemId, ItemGroup>(
    rows.items.map((item) => [
      item.id,
      {
        item,
        relations: [],
        attempts: [],
        pullRequests: [],
        levers: [],
        liveLease: null,
        position: { kind: 'end', reason: 'no-pipeline' },
      },
    ]),
  );

  const attemptItems = new Map<AttemptId, ItemId>();

  for (const relation of rows.relations) {
    groups.get(relation.target)?.relations.push(relation);
  }

  for (const attempt of rows.attempts) {
    attemptItems.set(attempt.id, attempt.item);
    groups.get(attempt.item)?.attempts.push(attempt);
  }

  for (const pullRequest of rows.pullRequests) {
    const item = attemptItems.get(pullRequest.attempt);

    if (item !== undefined) {
      groups.get(item)?.pullRequests.push(pullRequest);
    }
  }

  for (const lever of rows.levers) {
    groups.get(lever.item)?.levers.push(lever);
  }

  for (const lease of rows.liveLeases) {
    const group = groups.get(lease.item);

    if (group !== undefined) {
      group.liveLease = lease;
    }
  }

  for (const group of groups.values()) {
    group.position = findPosition({
      pipeline: rules.kinds.get(group.item.kind)?.pipeline ?? null,
      attempts: collectSettled(group.attempts),
      retries: collectRetries(group.levers, now),
    });
  }

  return [...groups.values()];
}

// the settled attempts, oldest end first
function collectSettled(attempts: readonly AttemptRow[]): Settled[] {
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

const retryKind = 'item.retry';

// No lever undoes `item.retry` and none sets its expiry, so the live levers hold every one.
function collectRetries(levers: readonly LeverRow[], now: Instant): RetryLever[] {
  return liveLevers(levers, now)
    .filter((lever) => lever.kind === retryKind)
    .map((lever) => ({ at: lever.at, phase: lever.phase }))
    .toSorted((first, second) => first.at - second.at);
}

interface Blocking {
  // the live relations whose target is the item
  readonly relations: readonly RelationRow[];
  readonly blockerStates: ReadonlyMap<ItemId, ItemState>;
}

function deriveGroupState(group: ItemGroup, rules: ItemRules, blocking: Blocking): DerivedState {
  return deriveItemState({
    ...blocking,
    item: group.item,
    position: group.position,
    liveLease: group.liveLease,
    phases: rules.phases,
    attempts: group.attempts,
    pullRequests: group.pullRequests,
  });
}

function buildItemWithLevers(
  group: ItemGroup,
  derived: DerivedState,
  now: Instant,
): ItemWithLevers {
  return {
    ...group.item,
    derived,
    position: group.position,
    levers: liveLevers(group.levers, now),
  };
}
