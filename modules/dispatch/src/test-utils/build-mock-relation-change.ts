import { brandSchemas } from '@boxxy/model';
import type { ItemId, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

interface RelationInput {
  readonly source: ItemId;
  readonly target: ItemId;
}

export function buildMockRelationChange(input: RelationInput): StoreChange {
  const type = brandSchemas.relationTypeName.parse('blocks');
  const addedAt = brandSchemas.instant.parse(3500);

  return {
    at: addedAt,
    writes: [
      {
        op: 'insert',
        table: 'relations',
        row: {
          source: input.source,
          target: input.target,
          type,
          addedBy: 'boxxy:owner:local',
          addedAt,
          removedAt: null,
        },
      },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.relation.added',
        entity: `boxxy:relation:${input.source}:${type}:${input.target}`,
        actor: 'boxxy:owner:local',
        payload: { source: input.source, target: input.target, type },
      },
    ],
  };
}
