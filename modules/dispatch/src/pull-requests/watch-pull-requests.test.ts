import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { watchLimits } from './constants.ts';
import { watchPullRequests } from './watch-pull-requests.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();

  const attempt = await dispatch.seedBuild();

  const repo = brandSchemas.repoName.parse('example/app');
  const sha = brandSchemas.commitSha.parse('a'.repeat(40));

  return {
    ...dispatch,
    forge,
    attempt,
    repo,
    sha,
    addPullRequest: (
      number: number,
      reading: { state?: 'open' | 'closed' | 'merged'; message?: string } = {},
    ) => {
      const state = reading.state ?? 'open';

      forge.seed({
        ref: { repo, number },
        githubId: 9_000_000 + number,
        reading: {
          state,
          mergedAt: state === 'merged' ? brandSchemas.instant.parse(1_800_000_000_000) : null,
          mergeCommit: state === 'merged' ? brandSchemas.commitSha.parse('b'.repeat(40)) : null,
          commits: [{ sha, message: reading.message ?? `Fix\n\nBoxxy-Attempt: ${attempt.id}` }],
        },
      });
    },
    watch: () =>
      watchPullRequests({
        store: dispatch.store,
        forge,
        rules: dispatch.rules(),
        runner: dispatch.runner,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    readPullRequests: () =>
      dispatch.store.read(async (reader) => {
        const detail = await reader.readItemDetail(
          attempt.item,
          dispatch.clock.now(),
          dispatch.rules(),
        );

        return detail?.pullRequests ?? [];
      }),
    readEvidence: () => dispatch.store.read((reader) => reader.listEvidence(attempt.id)),
  };
}

test('it links the open pull request whose commit carries the attempt trailer', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(3, { message: 'Other work' });
  ctx.addPullRequest(4);

  const report = await ctx.watch();
  const rows = await ctx.readPullRequests();

  expect(report).toStrictEqual({
    linked: 1,
    commitsLinked: 1,
    merged: 0,
    closed: 0,
    unanswered: 0,
  });

  expect(rows.map((row) => [row.number, row.state])).toStrictEqual([[4, 'open']]);
});

test('it links the commit of a linked pull request once, across passes', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(4);

  await ctx.watch();

  const second = await ctx.watch();
  const evidence = await ctx.readEvidence();
  const facts = await ctx.listFacts('boxxy.commit.linked');

  expect(second.commitsLinked).toBe(0);

  expect(
    evidence.filter((row) => row.kind === 'commit').map((row) => [row.ref, row.source]),
  ).toStrictEqual([[ctx.sha, 'trailer']]);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    { attempt: ctx.attempt.id, repo: ctx.repo, sha: ctx.sha, pullRequestNumber: 4 },
  ]);
});

test('it records a merge once, with the merge time and commit', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(4);

  await ctx.watch();

  ctx.addPullRequest(4, { state: 'merged' });
  ctx.clock.advance(300_000);

  const merging = await ctx.watch();
  const again = await ctx.watch();
  const rows = await ctx.readPullRequests();
  const facts = await ctx.listFacts('boxxy.pull_request.merged');

  expect([merging.merged, again.merged]).toStrictEqual([1, 0]);

  expect(rows.map((row) => ({ state: row.state, mergedAt: row.mergedAt }))).toStrictEqual([
    { state: 'merged', mergedAt: brandSchemas.instant.parse(1_800_000_000_000) },
  ]);

  expect(rows.map((row) => row.mergeCommit)).toStrictEqual([
    brandSchemas.commitSha.parse('b'.repeat(40)),
  ]);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    {
      attempt: ctx.attempt.id,
      repo: ctx.repo,
      number: 4,
      pullRequestId: '9000004',
      mergedAt: 1_800_000_000_000,
      mergeCommit: 'b'.repeat(40),
    },
  ]);
});

test('it records a close with no merge', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(4);

  await ctx.watch();

  ctx.addPullRequest(4, { state: 'closed' });

  const report = await ctx.watch();
  const facts = await ctx.listFacts('boxxy.pull_request.closed');

  expect(report.closed).toBe(1);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    { attempt: ctx.attempt.id, repo: ctx.repo, number: 4, pullRequestId: '9000004' },
  ]);
});

test('it sets the checked time of a pull request that is still open', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(4);

  await ctx.watch();

  ctx.clock.advance(300_000);

  const checkedAt = ctx.clock.now();

  await ctx.watch();

  const rows = await ctx.readPullRequests();

  expect(rows.map((row) => row.checkedAt)).toStrictEqual([checkedAt]);
});

test('it writes nothing and counts the call when the forge is down, then catches up', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(4);
  ctx.forge.setDown(true);

  const down = await ctx.watch();
  const whileDown = await ctx.readPullRequests();

  ctx.forge.setDown(false);

  const up = await ctx.watch();

  expect([down.unanswered > 0, down.linked, whileDown]).toStrictEqual([true, 0, []]);
  expect(up.linked).toBe(1);
});

test('it leaves a build alone once it ended longer ago than the link window', async () => {
  const ctx = await setupTest();

  ctx.addPullRequest(4);
  ctx.clock.advance(watchLimits.linkWindowMs + 1_000_000);

  const report = await ctx.watch();

  expect(report.linked).toBe(0);
  expect(ctx.forge.calls).toStrictEqual([]);
});
