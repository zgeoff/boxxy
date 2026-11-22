import { brandSchemas, itemRefPattern } from '@boxxy/model';
import type { ItemId, StoreReader } from '@boxxy/model';

// The ID of the item that an incoming reference names: a short reference such as `i-12` is looked
// up by its number, and any other value must be an item ID. Null when the value names no item.
export function resolveItemID(tx: StoreReader, raw: string): Promise<ItemId | null> {
  if (itemRefPattern.test(raw)) {
    return tx.readItemIdByRef(brandSchemas.itemRef.parse(raw));
  }

  const id = brandSchemas.itemId.safeParse(raw);
  const resolved = id.success ? id.data : null;

  return Promise.resolve(resolved);
}
