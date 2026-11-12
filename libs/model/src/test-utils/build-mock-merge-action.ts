import { faker } from '@faker-js/faker';
import type { JobAction } from '../ports/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { CommitSha } from '../types.ts';

// A squash merge of one pull request at `head`, with one required check.
export function buildMockMergeAction(
  head: CommitSha = brandSchemas.commitSha.parse(faker.git.commitSha()),
): JobAction {
  return {
    kind: 'merge',
    unit: {
      members: [
        {
          pullRequest: {
            repo: brandSchemas.repoName.parse('example/app'),
            number: faker.number.int({ min: 1, max: 9999 }),
          },
          head,
        },
      ],
    },
    method: 'squash',
    required: ['pr / checks'],
  };
}
