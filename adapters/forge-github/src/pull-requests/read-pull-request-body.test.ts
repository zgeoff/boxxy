import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createGithubClient } from '../create-github-client.ts';
import { GITHUB_API_URL, githubPullRequests } from '../test-utils/github-handlers.ts';
import { readPullRequestBody } from './read-pull-request-body.ts';

function setupTest() {
  const client = createGithubClient({ fetch: globalThis.fetch, baseUrl: GITHUB_API_URL });

  return { repo: brandSchemas.repoName.parse('acme/lamps'), client };
}

test('it reads the description of the pull request', async () => {
  const ctx = setupTest();

  await githubPullRequests.create({ repo: 'acme/lamps', number: 87, body: 'Fix the lamp.' });

  const body = await readPullRequestBody(ctx.client, { repo: ctx.repo, number: 87 });

  expect(body).toBe('Fix the lamp.');
});

test('it reads a pull request with no description as empty', async () => {
  const ctx = setupTest();

  await githubPullRequests.create({ repo: 'acme/lamps', number: 88 });

  const body = await readPullRequestBody(ctx.client, { repo: ctx.repo, number: 88 });

  expect(body).toBe('');
});

test('it throws a 404 error for a pull request that GitHub does not hold', () => {
  const ctx = setupTest();

  expect(readPullRequestBody(ctx.client, { repo: ctx.repo, number: 404 })).rejects.toMatchObject({
    status: 404,
  });
});
