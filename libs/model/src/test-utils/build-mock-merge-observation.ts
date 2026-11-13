import { faker } from '@faker-js/faker';
import type { MergeObservation } from '../merge/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';

// An open pull request that merges cleanly, with `pr / checks` green at its head, a review that
// passed at that head and a verified reading there: every check of the merge rule passes.
export function buildMockMergeObservation(
  overrides: Partial<MergeObservation> = {},
): MergeObservation {
  const head = overrides.head ?? brandSchemas.commitSha.parse(faker.git.commitSha());

  return {
    pullRequest: {
      repo: brandSchemas.repoName.parse('acme/lamps'),
      number: faker.number.int({ min: 1, max: 9999 }),
    },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: new Map([['pr / checks', 'success']]),
    baseRequired: [],
    mergeCommit: null,
    review: {
      head,
      status: 'passed',
      attempt: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    },
    verify: { status: 'verified', head, features: [{ name: 'file-item', status: 'verified' }] },
    ...overrides,
  };
}
