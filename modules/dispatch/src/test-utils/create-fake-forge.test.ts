import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeForge } from './create-fake-forge.ts';
import { forgeContract } from './forge-contract.ts';

test.each(forgeContract)('it keeps the forge contract: %s', async (_title, check) => {
  const forge = createFakeForge();

  const outcome = await check({ forge, seed: forge.seed, seedCompare: forge.seedCompare });

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
