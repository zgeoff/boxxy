import { expect, test } from 'bun:test';
import { forgeContract } from '@boxxy/dispatch/test-utils/forge-contract';
import { brandSchemas } from '@boxxy/model';
import { createGithubForge } from './create-github-forge.ts';
import { GithubForgeError } from './github-forge-error.ts';
import { createFakeGithubFetch } from './test-utils/create-fake-github-fetch.ts';

function setupTest(token?: string) {
  const github = createFakeGithubFetch();

  const forge = createGithubForge({
    fetch: github.fetch,
    baseUrl: 'https://api.github.test/',
    ...(token === undefined ? {} : { token }),
  });

  const repo = brandSchemas.repoName.parse('acme/lamps');

  return { github, forge, repo, ref: { repo, number: 7 } };
}

test.each(forgeContract)('it keeps the forge contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check({
    forge: ctx.forge,
    seed: ctx.github.seed,
    seedCompare: ctx.github.seedCompare,
  });

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it sends the token as a bearer token when it has one', async () => {
  const ctx = setupTest('token-for-tests');

  await ctx.forge.readPullRequest(ctx.ref);

  expect(ctx.github.requests.map((request) => request.headers['authorization'])).toStrictEqual([
    'Bearer token-for-tests',
  ]);
});

test('it sends no authorization header without a token', async () => {
  const ctx = setupTest();

  await ctx.forge.readPullRequest(ctx.ref);

  expect(ctx.github.requests.map((request) => 'authorization' in request.headers)).toStrictEqual([
    false,
  ]);
});

test('it asks for the pull request at the base URL without a double slash', async () => {
  const ctx = setupTest();

  await ctx.forge.readPullRequest(ctx.ref);

  expect(ctx.github.requests.map((request) => request.url)).toStrictEqual([
    'https://api.github.test/repos/acme/lamps/pulls/7',
  ]);
});

test('it throws an error that names the status and holds no token for a server error', async () => {
  const ctx = setupTest('token-for-tests');

  ctx.github.answerWith(503, 'unavailable');

  const failure = await ctx.forge.readPullRequest(ctx.ref).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(GithubForgeError);

  expect(String(failure)).toBe(
    'GithubForgeError: GitHub answered 503 to GET /repos/acme/lamps/pulls/7',
  );
});

test('it throws for a body that is not a pull request', async () => {
  const ctx = setupTest();

  ctx.github.answerWith(200, JSON.stringify({ id: 'seven' }));

  const failure = await ctx.forge.readPullRequest(ctx.ref).catch((error: unknown) => error);

  expect(String(failure)).toMatch(/unknown body/u);
});

test('it throws for an open pull request list of a repo GitHub does not know', async () => {
  const ctx = setupTest();

  ctx.github.answerWith(404, '{}');

  const failure = await ctx.forge.listOpenPullRequests(ctx.repo).catch((error: unknown) => error);

  expect(String(failure)).toMatch(/did not find/u);
});
