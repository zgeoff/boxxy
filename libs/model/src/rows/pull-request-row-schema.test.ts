import { expect, test } from 'bun:test';
import { pullRequestRowSchema } from './pull-request-row-schema.ts';

test("it accepts a merged pull request with GitHub's own id", () => {
  const row = {
    repo: 'acme/widgets',
    number: 41,
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    githubId: 9001,
    url: 'https://github.com/acme/widgets/pull/41',
    state: 'merged',
    mergedAt: 3000,
    mergeCommit: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    checkedAt: 3100,
  };

  const parsed: unknown = pullRequestRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a pull request with no GitHub id', () => {
  expect(pullRequestRowSchema.safeParse({ number: 41 }).error?.issues).toPartiallyContain({
    path: ['githubId'],
  });
});
