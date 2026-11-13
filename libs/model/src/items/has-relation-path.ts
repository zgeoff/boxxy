import type { ItemId, RelationRow } from '../types.ts';

// True when `to` is `from`, or the relations lead from `from` to `to`. A new relation from `to`
// to `from` of the same type would then close a loop.
export function hasRelationPath(
  relations: readonly RelationRow[],
  from: ItemId,
  to: ItemId,
): boolean {
  const seen = new Set<ItemId>();

  const queue: ItemId[] = [from];

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (next === to) {
      return true;
    }

    if (!seen.has(next)) {
      seen.add(next);
      queue.push(...relations.filter((row) => row.source === next).map((row) => row.target));
    }
  }

  return false;
}
