import { faker } from '@faker-js/faker';
import { brandSchemas } from '../brand-schemas.ts';
import type { EvidenceRow } from '../types/core.ts';

export function buildMockEvidenceRow(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    factId: brandSchemas.factId.parse(`manual:${faker.string.uuid({ version: 7 })}`),
    attempt: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    kind: 'test',
    ref: faker.system.filePath(),
    observed: null,
    source: 'agent',
    at: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    ...overrides,
  };
}
