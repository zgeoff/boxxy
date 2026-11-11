import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { RelationRow } from '../types.ts';

export function buildMockRelationRow(overrides: Partial<RelationRow> = {}): RelationRow {
  return {
    source: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    target: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    type: brandSchemas.relationTypeName.parse('blocks'),
    addedBy: 'boxxy:owner:local',
    addedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    removedAt: null,
    ...overrides,
  };
}
