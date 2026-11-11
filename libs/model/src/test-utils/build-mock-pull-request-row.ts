import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { SliceOnePullRequestRow as PullRequestRow } from '../slice-one/types.ts';

export function buildMockPullRequestRow(overrides: Partial<PullRequestRow> = {}): PullRequestRow {
  return {
    repo: brandSchemas.repoName.parse(`${faker.string.alpha(8)}/${faker.string.alpha(8)}`),
    number: faker.number.int({ min: 1, max: 10_000 }),
    attempt: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    state: 'open',
    mergedAt: null,
    mergeCommit: null,
    checkedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    ...overrides,
  };
}
