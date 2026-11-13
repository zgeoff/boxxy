import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createGithubClient } from '../create-github-client.ts';
import {
  GITHUB_API_URL,
  githubCheckRuns,
  githubCommitStatuses,
} from '../test-utils/github-handlers.ts';
import { readChecks } from './read-checks.ts';

function setupTest() {
  const client = createGithubClient({ fetch: globalThis.fetch, baseUrl: GITHUB_API_URL });

  return {
    repo: brandSchemas.repoName.parse('acme/lamps'),
    head: brandSchemas.commitSha.parse('3f2a91c0'.padEnd(40, '0')),
    client,
  };
}

test('it reads each check run and commit status at the head by name', async () => {
  const ctx = setupTest();

  await githubCheckRuns.create({ repo: 'acme/lamps', head: ctx.head, name: 'pr / checks' });

  await githubCheckRuns.create({
    repo: 'acme/lamps',
    head: ctx.head,
    name: 'verify / gate',
    status: 'in_progress',
    conclusion: null,
  });

  await githubCommitStatuses.create({
    repo: 'acme/lamps',
    head: ctx.head,
    context: 'deploy/preview',
    state: 'failure',
  });

  const checks = await readChecks(ctx.client, ctx.repo, ctx.head);

  expect(checks).toStrictEqual(
    new Map([
      ['deploy/preview', { state: 'failure', source: 'commit-status' }],
      ['pr / checks', { state: 'success', source: 'check-run' }],
      ['verify / gate', { state: 'pending', source: 'check-run' }],
    ]),
  );
});

test('it reads the newest run of a check name that ran twice at the head', async () => {
  const ctx = setupTest();

  await githubCheckRuns.create({
    repo: 'acme/lamps',
    head: ctx.head,
    id: 200,
    name: 'verify / gate',
    status: 'queued',
    conclusion: null,
  });

  await githubCheckRuns.create({
    repo: 'acme/lamps',
    head: ctx.head,
    id: 100,
    name: 'verify / gate',
    conclusion: 'success',
  });

  const checks = await readChecks(ctx.client, ctx.repo, ctx.head);

  expect(checks).toStrictEqual(
    new Map([['verify / gate', { state: 'pending', source: 'check-run' }]]),
  );
});

test('it reads every check run over one page', async () => {
  const ctx = setupTest();

  for (let index = 1; index <= 105; index += 1) {
    await githubCheckRuns.create({
      repo: 'acme/lamps',
      head: ctx.head,
      id: index,
      name: `check ${index}`,
    });
  }

  const checks = await readChecks(ctx.client, ctx.repo, ctx.head);

  expect(checks.size).toBe(105);
});

test('it reads every commit status over one page', async () => {
  const ctx = setupTest();

  for (let index = 1; index <= 105; index += 1) {
    await githubCommitStatuses.create({
      repo: 'acme/lamps',
      head: ctx.head,
      context: `status ${index}`,
    });
  }

  const checks = await readChecks(ctx.client, ctx.repo, ctx.head);

  expect(checks.size).toBe(105);
});

test('it reads no checks at a head with no runs and no statuses', async () => {
  const ctx = setupTest();

  await githubCheckRuns.create({ repo: 'acme/lamps', name: 'pr / checks' });

  const checks = await readChecks(ctx.client, ctx.repo, ctx.head);

  expect(checks).toStrictEqual(new Map());
});
