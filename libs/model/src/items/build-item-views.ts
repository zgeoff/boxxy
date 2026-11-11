import type {
  AttemptId,
  AttemptRow,
  Instant,
  ItemId,
  ItemKindName,
  ItemRow,
  ItemRows,
  ItemSetRows,
  ItemState,
  ItemWithLevers,
  LeaseRow,
  LeverRow,
  LinkRow,
  MaxAttemptsByKind,
  PullRequestRow,
} from '../types.ts';
import { deriveItemState } from './derive-item-state.ts';
import { liveLevers } from './live-levers.ts';

export function buildItemViews(
  rows: ItemSetRows,
  now: Instant,
  maxAttemptsByKind: MaxAttemptsByKind,
): ItemWithLevers[] {
  const groups = collectItemGroups(rows, now);

  // A blocking source counts only when it is done or archived, and no link makes an item either,
  // so each source's state derived without its links settles its targets.
  const ownStates = new Map<ItemId, ItemState>(
    rows.items.map((item) => [
      item.id,
      deriveItemState(
        item,
        buildItemRows(item, groups.get(item.id), maxAttemptsByKind, {
          links: [],
          blockerStates: new Map(),
        }),
      ).state,
    ]),
  );

  return rows.items.map((item) => {
    const group = groups.get(item.id);

    const itemRows = buildItemRows(item, group, maxAttemptsByKind, {
      links: group?.links ?? [],
      blockerStates: ownStates,
    });

    return { ...item, derived: deriveItemState(item, itemRows), levers: group?.levers ?? [] };
  });
}

interface ItemGroup {
  readonly links: LinkRow[];
  readonly attempts: AttemptRow[];
  readonly pullRequests: PullRequestRow[];
  levers: LeverRow[];
  liveLease: LeaseRow | null;
}

function collectItemGroups(rows: ItemSetRows, now: Instant): Map<ItemId, ItemGroup> {
  const groups = new Map<ItemId, ItemGroup>(
    rows.items.map((item) => [
      item.id,
      { links: [], attempts: [], pullRequests: [], levers: [], liveLease: null },
    ]),
  );

  const attemptItems = new Map<AttemptId, ItemId>();

  for (const link of rows.links) {
    groups.get(link.target)?.links.push(link);
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
  blocking: Pick<ItemRows, 'links' | 'blockerStates'>,
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
