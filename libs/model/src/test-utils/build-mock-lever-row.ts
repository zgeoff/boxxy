import { faker } from '@faker-js/faker';
import { brandSchemas } from '../brand-schemas.ts';
import type { LeverRow } from '../types/core.ts';

export function buildMockLeverRow(overrides: Partial<LeverRow> = {}): LeverRow {
  return {
    seq: faker.number.int({ min: 1, max: 10_000 }),
    kind: 'plan.defer',
    item: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    until: null,
    expiresAt: null,
    reason: faker.lorem.sentence(),
    actor: 'boxxy:owner:local',
    at: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    ...overrides,
  };
}
