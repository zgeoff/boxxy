import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { LinkRow } from '../types.ts';

export function buildMockLinkRow(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    source: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    target: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    type: brandSchemas.linkTypeName.parse('blocks'),
    addedBy: 'boxxy:owner:local',
    addedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    removedAt: null,
    ...overrides,
  };
}
