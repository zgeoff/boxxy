import type { ItemRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

export function buildMockFileItemChange(item: ItemRow): StoreChange {
  const { keptSession: _keptSession, ...filed } = item;

  return {
    at: item.filedAt,
    writes: [{ op: 'insert', table: 'items', row: item }],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.item.filed',
        entity: `boxxy:item:${item.id}`,
        actor: 'boxxy:owner:local',
        payload: filed,
      },
    ],
  };
}
