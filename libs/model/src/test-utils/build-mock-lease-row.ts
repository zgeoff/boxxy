import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { LeaseRow } from '../types.ts';

export function buildMockLeaseRow(overrides: Partial<LeaseRow> = {}): LeaseRow {
  return {
    item: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    phase: brandSchemas.phaseName.parse('build'),
    attempt: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    gen: 1,
    takenAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    releasedAt: null,
    ...overrides,
  };
}
