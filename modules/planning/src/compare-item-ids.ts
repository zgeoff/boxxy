import type { ItemId } from '@boxxy/model';

// compares by UTF-16 code units, so the order never depends on the locale
export function compareItemIDs(left: ItemId, right: ItemId): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
