import { faker } from '@faker-js/faker';
import { brandSchemas } from '../brand-schemas.ts';
import type { ItemRow } from '../types/core.ts';

export function buildMockItemRow(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    kind: brandSchemas.itemKindName.parse('core.issue'),
    repo: brandSchemas.repoName.parse(`${faker.string.alpha(8)}/${faker.string.alpha(8)}`),
    title: faker.lorem.sentence(),
    outcome: faker.lorem.sentence(),
    acceptance: [
      { id: brandSchemas.criterionId.parse('a1'), text: faker.lorem.sentence(), evidence: [] },
    ],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    closedAt: null,
    closeReason: null,
    ...overrides,
  };
}
