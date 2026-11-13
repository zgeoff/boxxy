import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createGithubClient } from '../create-github-client.ts';
import { GITHUB_API_URL, githubPullRequests } from '../test-utils/github-handlers.ts';
import { readMergeable } from './read-mergeable.ts';

function setupTest() {
  const client = createGithubClient({ fetch: globalThis.fetch, baseUrl: GITHUB_API_URL });

  return { repo: brandSchemas.repoName.parse('acme/lamps'), client };
}

test.each([
  [true, 'clean'],
  [false, 'conflict'],
  [null, 'unknown'],
] as const)('it reads GitHub mergeable %p as %s', async (mergeable, expected) => {
  const ctx = setupTest();

  await githubPullRequests.create({ repo: 'acme/lamps', number: 21, mergeable });

  const state = await readMergeable(ctx.client, { repo: ctx.repo, number: 21 });

  expect(state).toBe(expected);
});

test('it throws a 404 error for a pull request that GitHub does not hold', () => {
  const ctx = setupTest();

  expect(readMergeable(ctx.client, { repo: ctx.repo, number: 404 })).rejects.toMatchObject({
    status: 404,
  });
});
