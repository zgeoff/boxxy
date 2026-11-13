import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockRelationChange } from './build-mock-relation-change.ts';

test('it builds a change that adds a live blocks relation', () => {
  const source = buildMockV1ItemRow().id;
  const target = buildMockV1ItemRow().id;
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
        entity: `boxxy:item:${source}`,
        actor: 'boxxy:owner:local',
        payload: { source, target, type: 'blocks' },
      },
    ],
  });
});

test('it builds a change that adds a live relation of the type it names', () => {
  const source = buildMockV1ItemRow().id;
  const target = buildMockV1ItemRow().id;
  const type = brandSchemas.relationTypeName.parse('duplicate-of');
  const change = buildMockRelationChange({ source, target, type });

  expect(change.writes).toStrictEqual([
    {
      op: 'insert',
      table: 'relations',
      row: expect.objectContaining({ source, target, type: 'duplicate-of' }),
    },
  ]);
});
