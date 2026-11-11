import { deriveSliceOneItemState } from '../slice-one/derive-slice-one-item-state.ts';
import type {
  SliceOneDerivedAttempt as DerivedAttempt,
  SliceOneDerivedPullRequest as DerivedPullRequest,
  SliceOneDerivedState as DerivedState,
  SliceOneItemRow as ItemRow,
  SliceOneItemRows as ItemRows,
  SliceOneItemSetRows as ItemSetRows,
  SliceOneLeverRow as LeverRow,
  MaxAttemptsByKind,
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

// Generic, so that the store's v1 rows come back as v1 rows with the slice 1 derived state.
export function buildItemViews<Item extends ItemRow, Lever extends LeverRow>(
  rows: ItemSetRows<Item, Lever>,
  now: Instant,
  maxAttemptsByKind: MaxAttemptsByKind,
): (Item & { readonly derived: DerivedState; readonly levers: readonly Lever[] })[] {
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

interface ItemGroup<Lever extends LeverRow> {
  readonly relations: RelationRow[];
  readonly attempts: DerivedAttempt[];
  readonly pullRequests: DerivedPullRequest[];
  levers: Lever[];
  liveLease: LeaseRow | null;
}

function collectItemGroups<Item extends ItemRow, Lever extends LeverRow>(
  rows: ItemSetRows<Item, Lever>,
  now: Instant,
): Map<ItemId, ItemGroup<Lever>> {
  const groups = new Map<ItemId, ItemGroup<Lever>>(
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

function buildItemRows<Lever extends LeverRow>(
  item: ItemRow,
  group: ItemGroup<Lever> | undefined,
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
