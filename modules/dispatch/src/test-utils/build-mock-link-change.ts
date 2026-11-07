import { brandSchemas } from '@boxxy/model';
import type { ItemId, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

interface LinkInput {
  readonly source: ItemId;
  readonly target: ItemId;
}

export function buildMockLinkChange(input: LinkInput): StoreChange {
  const type = brandSchemas.linkTypeName.parse('blocks');
  const addedAt = brandSchemas.instant.parse(3500);

  return {
    at: addedAt,
    writes: [
      {
        op: 'insert',
        table: 'links',
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
        type: 'boxxy.link.added',
        entity: `boxxy:link:${input.source}:${type}:${input.target}`,
        actor: 'boxxy:owner:local',
        payload: { source: input.source, target: input.target, type },
      },
    ],
  };
}
