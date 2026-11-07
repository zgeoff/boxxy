import { expect, test } from 'bun:test';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';

test('it builds a change that inserts the item with its filed fact', () => {
  const item = buildMockItemRow();
  const change: unknown = buildMockFileItemChange(item);

  expect(change).toStrictEqual({
    at: item.filedAt,
    writes: [{ op: 'insert', table: 'items', row: item }],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.item.filed',
        entity: `boxxy:item:${item.id}`,
        actor: 'boxxy:owner:local',
        payload: item,
      },
    ],
  });
});
