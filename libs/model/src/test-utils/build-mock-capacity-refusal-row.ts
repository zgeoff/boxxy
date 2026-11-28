import { faker } from '@faker-js/faker';
import type { CapacityRefusalRow } from '../ports/capacity-refusals.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';

export function buildMockCapacityRefusalRow(
  overrides: Partial<CapacityRefusalRow> = {},
): CapacityRefusalRow {
  return {
    id: brandSchemas.capacityRefusalId.parse(faker.string.uuid({ version: 7 })),
    attempt: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    item: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    phase: brandSchemas.phaseName.parse('build'),
    pool: brandSchemas.poolName.parse('main'),
    at: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    refusal: null,
    ...overrides,
  };
}
