import { expect, test } from 'bun:test';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';

test('it builds a change that inserts the item and files it with no kept session', () => {
  const item = buildMockV1ItemRow();
  const { keptSession: _keptSession, ...filed } = item;
  const change: unknown = buildMockFileItemChange(item);

  expect(change).toStrictEqual({
    at: item.filedAt,
    writes: [{ op: 'insert', table: 'items', row: item }],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.item.filed',
        entity: `boxxy:item:${item.id}`,
        actor: 'boxxy:owner:local',
        payload: filed,
      },
    ],
  });
});
