import { faker } from '@faker-js/faker';
import type { MergeCloseOut } from '../closeouts/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';

// The close-out of a merge that boxxy's own call merged, at a head with no verify reading.
export function buildMockMergeCloseOut(overrides: Partial<MergeCloseOut> = {}): MergeCloseOut {
  const head = overrides.head ?? brandSchemas.commitSha.parse(faker.git.commitSha());

  return {
    outcome: 'merged',
    head,
    required: ['pr / checks'],
    failed: [],
    cause: null,
    mergeCommit: brandSchemas.commitSha.parse(faker.git.commitSha()),
    reason: null,
    byBoxxy: true,
    verify: { status: 'not-covered', head },
    ...overrides,
  };
}
