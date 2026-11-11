import type {
  SliceOneDecision as Decision,
  Frame,
  FrameItem,
  ItemId,
  SliceOnePick as Pick,
  Pool,
  PoolName,
} from '@boxxy/model';
import { compareItemIDs } from './compare-item-ids.ts';

interface DecideInput {
  readonly frame: Frame;
  readonly pools: readonly Pool[];
  readonly freeSlots: Readonly<Record<PoolName, number>>;
}

export function decide(input: DecideInput): Decision {
  const frame = input.frame;

  const picked = new Set<ItemId>();

  const picks: Pick[] = [];

  for (const pool of input.pools) {
    const free = input.freeSlots[pool.name] ?? 0;

    const ranked = frame.candidates
      .filter(
        (item) =>
          !picked.has(item.id) &&
          (frame.holds.get(item.id) ?? []).length === 0 &&
          isTakenBy(pool, frame.fields.get(item.id) ?? {}),
      )
      .toSorted((left, right) => compareCandidates(left, right, pool, frame));

    for (const item of ranked.slice(0, free)) {
      picked.add(item.id);
      picks.push({ item: item.id, phase: item.phase, pool: pool.name });
    }
  }

  return { picks };
}

function isTakenBy(pool: Pool, fields: Readonly<Record<string, readonly string[]>>): boolean {
  return Object.entries(pool.takes).every(([field, accepted]) =>
    (fields[field] ?? []).some((value) => accepted.includes(value)),
  );
}

function compareCandidates(left: FrameItem, right: FrameItem, pool: Pool, frame: Frame): number {
  for (const key of pool.order) {
    const byItem = frame.values.get(key);
    const order = compareValues(byItem?.get(left.id), byItem?.get(right.id));

    if (order !== 0) {
      return order;
    }
  }

  return compareItemIDs(left.id, right.id);
}

function compareValues(left: number | undefined, right: number | undefined): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return left < right ? -1 : 1;
}
