import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { HttpResponse, http } from 'msw';
import { createGithubClient } from '../create-github-client.ts';
import branchRules from '../test-utils/fixtures/branch-rules.json' with { type: 'json' };
import protectedBranch from '../test-utils/fixtures/protected-branch.json' with { type: 'json' };
import { GITHUB_API_URL, githubBranches } from '../test-utils/github-handlers.ts';
import { mockNetwork } from '../test-utils/mock-network.ts';
import { readRequiredChecks } from './read-required-checks.ts';

function setupTest() {
  const client = createGithubClient({ fetch: globalThis.fetch, baseUrl: GITHUB_API_URL });

  return { repo: brandSchemas.repoName.parse('acme/lamps'), client };
}

test('it reads the checks from the rules and the protection that GitHub answers for the branch', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/rules/branches/main`, () =>
      HttpResponse.json(branchRules),
    ),
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/branches/main`, () =>
      HttpResponse.json(protectedBranch),
    ),
  );

  expect(readRequiredChecks(ctx.client, ctx.repo, 'main')).resolves.toStrictEqual([
    'build',
    'verify / gate',
    'preview',
  ]);
});

test('it reads the classic checks of a branch with a slash in its name', async () => {
  const ctx = setupTest();

  await githubBranches.create({
    repo: 'acme/lamps',
    name: 'release/2.0',
    classicChecks: ['pr / checks'],
  });

  const checks = await readRequiredChecks(ctx.client, ctx.repo, 'release/2.0');

  expect(checks).toStrictEqual(['pr / checks']);
});

test('it throws a 404 error for a branch that GitHub does not hold, though its rules answer', () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.get(`${GITHUB_API_URL}/repos/acme/lamps/rules/branches/gone`, () =>
      HttpResponse.json(branchRules),
    ),
  );

  expect(readRequiredChecks(ctx.client, ctx.repo, 'gone')).rejects.toMatchObject({
    status: 404,
  });
});
