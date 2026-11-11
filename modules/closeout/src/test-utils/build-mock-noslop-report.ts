import { brandSchemas } from '@boxxy/model';
import { faker } from '@faker-js/faker';
import type { NoslopReport } from '../types.ts';

// A review result as noslop's schema version 7 prints it, with no findings.
export function buildMockNoslopReport(overrides: Partial<NoslopReport> = {}): NoslopReport {
  return {
    version: 7,
    reviewID: faker.string.uuid(),
    repo: `${faker.word.noun()}/${faker.word.noun()}`,
    pullRequest: null,
    base: faker.git.commitSha(),
    head: brandSchemas.commitSha.parse(faker.git.commitSha()),
    title: faker.lorem.sentence(),
    depth: 'standard',
    special: null,
    riskClasses: [],
    lenses: [],
    calls: [],
    findings: [],
    dropped: [],
    failedCalls: [],
    notReviewed: [],
    notReviewedByLens: [],
    configHash: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
    startedAt: '2026-11-02T10:00:00.000Z',
    endedAt: '2026-11-02T10:04:00.000Z',
    ...overrides,
  };
}
