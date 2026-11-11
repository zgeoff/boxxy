import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockV1PullRequestRow } from './build-mock-v1-pull-request-row.ts';

test('it builds an open pull request row', () => {
  const built: unknown = buildMockV1PullRequestRow();

  expect(built).toStrictEqual({
    repo: expect.stringMatching(/^[a-z]+\/[a-z]+$/iu),
    number: expect.any(Number),
    attempt: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    githubId: expect.any(Number),
    url: expect.stringMatching(/^https:\/\//u),
    state: 'open',
    mergedAt: null,
    mergeCommit: null,
    checkedAt: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  const pullRequest = buildMockV1PullRequestRow({ state: 'closed', number: 41 });

  expect(pullRequest).toStrictEqual(expect.objectContaining({ state: 'closed', number: 41 }));
});

test('it builds the URL from the repo and number it is given', () => {
  const pullRequest = buildMockV1PullRequestRow({
    repo: brandSchemas.repoName.parse('acme/lamps'),
    number: 12,
  });

  expect(pullRequest.url).toBe('https://github.com/acme/lamps/pull/12');
});
