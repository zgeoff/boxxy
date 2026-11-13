import { expect, test } from 'bun:test';
import { forgeContract } from '@boxxy/dispatch/test-utils/forge-contract';
import { brandSchemas } from '@boxxy/model';
import { HttpResponse, http } from 'msw';
import { createGithubForge } from './create-github-forge.ts';
import { GithubForgeError } from './github-forge-error.ts';
import { buildGithubSeeders } from './test-utils/build-github-seeders.ts';
import pullRequest from './test-utils/fixtures/pull-request.json' with { type: 'json' };
import { GITHUB_API_URL } from './test-utils/github-handlers.ts';
import { mockNetwork } from './test-utils/mock-network.ts';

function setupTest() {
  const forge = createGithubForge({ fetch: globalThis.fetch, baseUrl: GITHUB_API_URL });
  const repo = brandSchemas.repoName.parse('acme/lamps');

  return {
    forge,
    repo,
    ref: { repo, number: 7 },
    harness: { forge, ...buildGithubSeeders() },
  };
}

test.each(forgeContract)('it keeps the forge contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check(ctx.harness);

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it reads the token before each call and sends it as a bearer token', async () => {
  const ctx = setupTest();
  const sent: (string | null)[] = [];
  const tokens = ['token-for-tests-1', 'token-for-tests-2'];

  const forge = createGithubForge({
    fetch: globalThis.fetch,
    baseUrl: GITHUB_API_URL,
    readToken: () => Promise.resolve(tokens.shift() ?? 'no-token-left'),
  });

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls/7`, (info) => {
      sent.push(info.request.headers.get('authorization'));

      return HttpResponse.json({ message: 'Not Found' }, { status: 404 });
    }),
  );

  await forge.readPullRequest(ctx.ref);
  await forge.readPullRequest(ctx.ref);

  expect(sent).toStrictEqual(['Bearer token-for-tests-1', 'Bearer token-for-tests-2']);
});

test('it sends no authorization header without a token', async () => {
  const ctx = setupTest();
  const sent: boolean[] = [];

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls/7`, (info) => {
      sent.push(info.request.headers.has('authorization'));

      return HttpResponse.json({ message: 'Not Found' }, { status: 404 });
    }),
  );

  await ctx.forge.readPullRequest(ctx.ref);

  expect(sent).toStrictEqual([false]);
});

test('it asks for the pull request at the base URL without a double slash', async () => {
  const ctx = setupTest();
  const urls: string[] = [];
  const forge = createGithubForge({ fetch: globalThis.fetch, baseUrl: `${GITHUB_API_URL}/` });

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/*`, (info) => {
      urls.push(info.request.url);

      return HttpResponse.json({ message: 'Not Found' }, { status: 404 });
    }),
  );

  await forge.readPullRequest(ctx.ref);

  expect(urls).toStrictEqual(['https://api.github.test/repos/acme/lamps/pulls/7']);
});

test('it throws an error that names the status and holds no token for a server error', () => {
  const ctx = setupTest();

  const forge = createGithubForge({
    fetch: globalThis.fetch,
    baseUrl: GITHUB_API_URL,
    readToken: () => Promise.resolve('token-for-tests'),
  });

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls/7`, () =>
      HttpResponse.text('unavailable', { status: 503 }),
    ),
  );

  expect(forge.readPullRequest(ctx.ref)).rejects.toThrowWithMessage(
    GithubForgeError,
    'GitHub answered 503 to GET /repos/acme/lamps/pulls/7',
  );
});

test('it reads the base branch of the pull request that GitHub answers', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls/7`, () => HttpResponse.json(pullRequest)),
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls/7/commits`, () => HttpResponse.json([])),
  );

  expect(ctx.forge.readPullRequest(ctx.ref)).resolves.toStrictEqual({
    url: 'https://github.com/acme/lamps/pull/7',
    githubId: 2_400_000_007,
    state: 'open',
    base: 'release/2.0',
    mergedAt: null,
    mergeCommit: null,
    commits: [],
  });
});

test('it throws for a body that is not a pull request', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls/7`, () =>
      HttpResponse.json({ id: 'seven' }),
    ),
  );

  expect(ctx.forge.readPullRequest(ctx.ref)).rejects.toThrow(/unknown body/u);
});

test('it throws for an open pull request list of a repo GitHub does not know', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/pulls`, () =>
      HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
    ),
  );

  expect(ctx.forge.listOpenPullRequests(ctx.repo)).rejects.toThrow(/did not find/u);
});
