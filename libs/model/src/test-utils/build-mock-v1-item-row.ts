import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { ItemRow } from '../types.ts';

// An open issue with one acceptance criterion, no labels and no kept session.
export function buildMockV1ItemRow(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    kind: brandSchemas.itemKindName.parse('core.issue'),
    repo: brandSchemas.repoName.parse(`${faker.string.alpha(8)}/${faker.string.alpha(8)}`),
    title: faker.lorem.sentence(),
    outcome: faker.lorem.sentence(),
    acceptance: [
      { id: brandSchemas.criterionId.parse('a1'), text: faker.lorem.sentence(), evidence: [] },
    ],
    fields: {},
    labels: [],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    closedAt: null,
    closeReason: null,
    keptSession: null,
    ...overrides,
  };
}
