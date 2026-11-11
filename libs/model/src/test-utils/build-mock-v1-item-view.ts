import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { ItemView } from '../types.ts';

// A ready item at the build phase of round 1. `buildMockItemView` still builds the slice 1 view
// that the store and planning read.
export function buildMockV1ItemView(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    kind: brandSchemas.itemKindName.parse('core.issue'),
    repo: brandSchemas.repoName.parse(`${faker.word.noun()}/${faker.word.noun()}`),
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
    derived: { state: 'ready' },
    position: { kind: 'phase', phase: brandSchemas.phaseName.parse('build'), round: 1 },
    ...overrides,
  };
}
