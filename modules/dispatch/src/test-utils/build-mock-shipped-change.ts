import type { ItemShipped, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

// The change that the ship watch writes: the row and its fact.
export function buildMockShippedChange(shipped: ItemShipped): StoreChange {
  return {
    at: shipped.seenAt,
    writes: [{ op: 'insert', table: 'item_shipped', row: shipped }],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.item.shipped',
        entity: `boxxy:item:${shipped.itemId}`,
        actor: 'boxxy:runner:runner-1',
        payload: shipped,
      },
    ],
  };
}
