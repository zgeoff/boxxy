import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockSettledAttemptRow } from '../test-utils/build-mock-settled-attempt-row.ts';
import { collectSettled } from './collect-settled.ts';

test('it reads the pull request of a review from its input, and none from a build', () => {
  const pullRequest = { repo: brandSchemas.repoName.parse('acme/widgets'), number: 12 };

  const settled = collectSettled([
    buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 1000 }),
    buildMockSettledAttemptRow({
      phase: 'review',
      outcome: 'passed',
      endedAt: 2000,
      input: { pullRequest, round: 1, cause: 'first', command: 'review' },
    }),
    buildMockSettledAttemptRow({ phase: 'review', outcome: 'lost', endedAt: 3000 }),
  ]);

  expect(settled.map((attempt) => attempt.pullRequest)).toStrictEqual([
    undefined,
    pullRequest,
    null,
  ]);
});
