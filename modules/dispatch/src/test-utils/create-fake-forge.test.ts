import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeForge } from './create-fake-forge.ts';
import { forgeContract } from './forge-contract.ts';

test.each(forgeContract)('it keeps the forge contract: %s', async (_title, check) => {
  const forge = createFakeForge();

  const outcome = await check({
    forge,
    seed: forge.seed,
    seedCompare: forge.seedCompare,
    seedRequiredChecks: forge.seedRequiredChecks,
    seedMergeable: forge.seedMergeable,
  });

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it reads a pull request by a repo name in another case, with the seeded url', async () => {
  const forge = createFakeForge();

  forge.seed({
    ref: { repo: brandSchemas.repoName.parse('Acme/Lamps'), number: 4 },
    githubId: 9_000_004,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const reading = await forge.readPullRequest({
    repo: brandSchemas.repoName.parse('acme/lamps'),
    number: 4,
  });

  expect(reading).toStrictEqual({
    state: 'open',
    mergedAt: null,
    mergeCommit: null,
    commits: [],
    githubId: 9_000_004,
    url: 'https://github.com/Acme/Lamps/pull/4',
  });
});

test('it rejects every call while it is down and answers again after', async () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');

  forge.setDown(true);

  const whileDown = await Promise.allSettled([
    forge.readPullRequest({ repo, number: 1 }),
    forge.listOpenPullRequests(repo),
  ]);

  forge.setDown(false);

  expect([
    whileDown.map((result) => result.status),
    await forge.listOpenPullRequests(repo),
  ]).toStrictEqual([['rejected', 'rejected'], []]);
});

test('it holds the next read until the test releases it', async () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');
  const hold = forge.holdNextRead();
  const read = forge.readPullRequest({ repo, number: 1 });

  await hold.entered;

  const whileHeld = await Promise.race([read, Promise.resolve('held')]);

  hold.release();

  expect([whileHeld, await read]).toStrictEqual(['held', 'not-found']);
});

test('#readPullRequestBody reads the seeded body of a pull request', async () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');

  forge.seed({
    ref: { repo, number: 5 },
    githubId: 9_000_005,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
    body: 'Fix the lamp switch.',
  });

  const body = await forge.readPullRequestBody({ repo, number: 5 });

  expect(body).toBe('Fix the lamp switch.');
});

test('#readPullRequestBody reads a pull request seeded with no body as empty', async () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');

  forge.seed({
    ref: { repo, number: 6 },
    githubId: 9_000_006,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const body = await forge.readPullRequestBody({ repo, number: 6 });

  expect(body).toBe('');
});

test('#readPullRequestBody rejects for a pull request it does not hold', () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');

  expect(forge.readPullRequestBody({ repo, number: 404 })).rejects.toThrow();
});

test('#readChecks reads the checks seeded at the head, and none at another head', async () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');
  const head = brandSchemas.commitSha.parse('a'.repeat(40));
  const otherHead = brandSchemas.commitSha.parse('b'.repeat(40));

  forge.seedChecks({
    repo,
    head,
    checks: { 'pr / checks': 'success', 'verify / gate': 'pending' },
  });

  const atHead = await forge.readChecks(repo, head);
  const atOtherHead = await forge.readChecks(repo, otherHead);

  expect([atHead, atOtherHead]).toStrictEqual([
    new Map([
      ['pr / checks', { state: 'success', source: 'check-run' }],
      ['verify / gate', { state: 'pending', source: 'check-run' }],
    ]),
    new Map(),
  ]);
});

test('#readChecks reads a seeded status as a commit status, under a check run of its name', async () => {
  const forge = createFakeForge();
  const repo = brandSchemas.repoName.parse('acme/lamps');
  const head = brandSchemas.commitSha.parse('a'.repeat(40));

  forge.seedChecks({
    repo,
    head,
    checks: { 'pr / checks': 'success' },
    statuses: { 'pr / checks': 'failure', 'deploy/preview': 'pending' },
  });

  const checks = await forge.readChecks(repo, head);

  expect(checks).toStrictEqual(
    new Map([
      ['pr / checks', { state: 'success', source: 'check-run' }],
      ['deploy/preview', { state: 'pending', source: 'commit-status' }],
    ]),
  );
});

test('#mergeAtHead logs the call with its head and method, and rejects while the forge is down', async () => {
  const forge = createFakeForge();
  const ref = { repo: brandSchemas.repoName.parse('acme/lamps'), number: 5 };
  const head = brandSchemas.commitSha.parse('b'.repeat(40));

  forge.seed({
    ref,
    githubId: 9_000_005,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Fix the lamp' }],
    },
  });

  forge.setDown(true);

  const whileDown = await Promise.allSettled([forge.mergeAtHead(ref, head, 'squash')]);

  expect([whileDown.map((result) => result.status), forge.calls]).toStrictEqual([
    ['rejected'],
    [`mergeAtHead acme/lamps#5 ${head} squash`],
  ]);
});

test('#readMergeable reads a pull request with no seeded state as clean', async () => {
  const forge = createFakeForge();
  const ref = { repo: brandSchemas.repoName.parse('acme/lamps'), number: 6 };

  forge.seed({
    ref,
    githubId: 9_000_006,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const mergeable = await forge.readMergeable(ref);

  expect(mergeable).toBe('clean');
});
