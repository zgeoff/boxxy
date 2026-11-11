import { deriveSliceOneItemState } from '../slice-one/derive-slice-one-item-state.ts';
import type {
  SliceOneAttemptRow as AttemptRow,
  SliceOneItemRow as ItemRow,
  SliceOneItemRows as ItemRows,
  SliceOneItemSetRows as ItemSetRows,
  SliceOneItemWithLevers as ItemWithLevers,
  SliceOneLeverRow as LeverRow,
  MaxAttemptsByKind,
  SliceOnePullRequestRow as PullRequestRow,
} from '../slice-one/types.ts';
import type {
  AttemptId,
  Instant,
  ItemId,
  ItemKindName,
  ItemState,
  LeaseRow,
  RelationRow,
} from '../types.ts';
import { liveLevers } from './live-levers.ts';

export function buildItemViews(
  rows: ItemSetRows,
  now: Instant,
  maxAttemptsByKind: MaxAttemptsByKind,
): ItemWithLevers[] {
  const groups = collectItemGroups(rows, now);

  // A blocking source counts only when it is done or archived, and no relation makes an item either,
  // so each source's state derived without its relations settles its targets.
  const ownStates = new Map<ItemId, ItemState>(
    rows.items.map((item) => [
      item.id,
      deriveSliceOneItemState(
        item,
        buildItemRows(item, groups.get(item.id), maxAttemptsByKind, {
          relations: [],
          blockerStates: new Map(),
        }),
      ).state,
    ]),
  );

  return rows.items.map((item) => {
    const group = groups.get(item.id);

    const itemRows = buildItemRows(item, group, maxAttemptsByKind, {
      relations: group?.relations ?? [],
      blockerStates: ownStates,
    });

    return {
      ...item,
      derived: deriveSliceOneItemState(item, itemRows),
      levers: group?.levers ?? [],
    };
  });
}

interface ItemGroup {
  readonly relations: RelationRow[];
  readonly attempts: AttemptRow[];
  readonly pullRequests: PullRequestRow[];
  levers: LeverRow[];
  liveLease: LeaseRow | null;
}

function collectItemGroups(rows: ItemSetRows, now: Instant): Map<ItemId, ItemGroup> {
  const groups = new Map<ItemId, ItemGroup>(
    rows.items.map((item) => [
      item.id,
      { relations: [], attempts: [], pullRequests: [], levers: [], liveLease: null },
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

  for (const lease of rows.liveLeases) {
    const group = groups.get(lease.item);

    if (group !== undefined) {
      group.liveLease = lease;
    }
  }

  for (const [item, group] of groups) {
    group.levers = liveLevers(
      rows.levers.filter((lever) => lever.item === item),
      now,
    );
  }

  return groups;
}

function buildItemRows(
  item: ItemRow,
  group: ItemGroup | undefined,
  maxAttemptsByKind: MaxAttemptsByKind,
  blocking: Pick<ItemRows, 'relations' | 'blockerStates'>,
): ItemRows {
  return {
    ...blocking,
    levers: group?.levers ?? [],
    attempts: group?.attempts ?? [],
    liveLease: group?.liveLease ?? null,
    pullRequests: group?.pullRequests ?? [],
    maxAttempts: pickMaxAttempts(item.kind, maxAttemptsByKind),
  };
}

function pickMaxAttempts(kind: ItemKindName, maxAttemptsByKind: MaxAttemptsByKind): number {
  const [first] = maxAttemptsByKind.get(kind)?.values() ?? [];

  return first ?? Number.POSITIVE_INFINITY;
}
