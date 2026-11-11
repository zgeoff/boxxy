import { expect, test } from 'bun:test';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockRelationChange } from './build-mock-relation-change.ts';

test('it builds a change that adds a live blocks relation', () => {
  const source = buildMockItemRow().id;
  const target = buildMockItemRow().id;
  const change: unknown = buildMockRelationChange({ source, target });

  expect(change).toStrictEqual({
    at: 3500,
    writes: [
      {
        op: 'insert',
        table: 'relations',
        row: {
          source,
          target,
          type: 'blocks',
          addedBy: 'boxxy:owner:local',
          addedAt: 3500,
          removedAt: null,
        },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.relation.added',
        entity: `boxxy:relation:${source}:blocks:${target}`,
        actor: 'boxxy:owner:local',
        payload: { source, target, type: 'blocks' },
      },
    ],
  });
});
