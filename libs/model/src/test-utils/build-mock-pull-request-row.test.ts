import { expect, test } from 'bun:test';
import { buildMockPullRequestRow } from './build-mock-pull-request-row.ts';

test('it builds a default pull request row', () => {
  const built: unknown = buildMockPullRequestRow();

  expect(built).toStrictEqual({
    repo: expect.stringMatching(/^[a-z]+\/[a-z]+$/iu),
    number: expect.any(Number),
    attempt: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    state: 'open',
    mergedAt: null,
    mergeCommit: null,
    checkedAt: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  const pullRequest = buildMockPullRequestRow({ state: 'closed', number: 41 });

  expect(pullRequest).toStrictEqual(expect.objectContaining({ state: 'closed', number: 41 }));
});
