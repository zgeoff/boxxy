import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { PullRequestRow } from '../types.ts';

// An open pull request. `buildMockPullRequestRow` still builds the slice 1 row that the store
// reads and writes.
export function buildMockV1PullRequestRow(overrides: Partial<PullRequestRow> = {}): PullRequestRow {
  const number = faker.number.int({ min: 1, max: 10_000 });

  return {
    repo: brandSchemas.repoName.parse(`${faker.string.alpha(8)}/${faker.string.alpha(8)}`),
    number,
    attempt: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    githubId: faker.number.int({ min: 1, max: 2_000_000_000 }),
    url: `https://example.test/pull/${number}`,
    state: 'open',
    mergedAt: null,
    mergeCommit: null,
    checkedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    ...overrides,
  };
}
