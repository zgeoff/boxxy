import { brandSchemas } from '@boxxy/model';
import type { ItemId, RelationTypeName, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

interface RelationInput {
  readonly source: ItemId;
  readonly target: ItemId;
  readonly type?: RelationTypeName;
}

export function buildMockRelationChange(input: RelationInput): StoreChange {
  const type = input.type ?? brandSchemas.relationTypeName.parse('blocks');
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
        entity: `boxxy:item:${input.source}`,
        actor: 'boxxy:owner:local',
        payload: { source: input.source, target: input.target, type },
      },
    ],
  };
}
