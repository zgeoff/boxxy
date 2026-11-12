import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { linkPullRequest } from './link-pull-request.ts';
import { watchPullRequests } from './watch-pull-requests.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();

  const attempt = await dispatch.seedBuild();

  const repo = brandSchemas.repoName.parse('example/app');

  const addOpenPullRequest = (number: number, message = ''): void => {
    forge.seed({
      ref: { repo, number },
      githubId: 9_000_000 + number,
      reading: {
        state: 'open',
        mergedAt: null,
        mergeCommit: null,
        commits: [{ sha: brandSchemas.commitSha.parse('a'.repeat(40)), message }],
      },
    });
  };

  return {
    ...dispatch,
    forge,
    attempt,
    repo,
    addOpenPullRequest,
    link: (url: string) =>
      linkPullRequest({
        store: dispatch.store,
        forge,
        rules: dispatch.rules(),
        call: dispatch.buildCallRef(attempt),
        url,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    watch: () =>
      watchPullRequests({
        store: dispatch.store,
        forge,
        rules: dispatch.rules(),
        runner: dispatch.runner,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    readRows: () =>
      dispatch.store.read(async (reader) => ({
        pullRequests: await reader.listWatchedPullRequests(),
        evidence: await reader.listEvidence(attempt.id),
      })),
  };
}

test('it links a pull request with GitHub id, evidence and one linked fact', async () => {
  const ctx = await setupTest();

  ctx.addOpenPullRequest(7);

  const answer = await ctx.link('https://github.com/example/app/pull/7');
  const rows = await ctx.readRows();
  const facts = await ctx.listFacts('boxxy.pull_request.linked');

  expect(answer).toStrictEqual({ kind: 'linked', repo: ctx.repo, number: 7, repeat: false });

  expect([
    rows.pullRequests.map((row) => [row.number, row.githubId, row.url, row.attempt]),
    rows.evidence
      .filter((row) => row.kind === 'pull_request')
      .map((row) => [row.kind, row.ref, row.source]),
    facts.map((fact) => fact.payload),
  ]).toStrictEqual([
    [[7, 9_000_007, 'https://github.com/example/app/pull/7', ctx.attempt.id]],
    [['pull_request', 'https://github.com/example/app/pull/7', 'hook']],
    [
      {
        attempt: ctx.attempt.id,
        repo: ctx.repo,
        number: 7,
        url: 'https://github.com/example/app/pull/7',
        pullRequestId: '9000007',
        source: 'hook',
      },
    ],
  ]);
});

test('it writes nothing and answers retry while the forge is down, and the watch then links it', async () => {
  const ctx = await setupTest();

  ctx.addOpenPullRequest(7, `Fix the lamp\n\nBoxxy-Attempt: ${ctx.attempt.id}`);
  ctx.forge.setDown(true);

  const answer = await ctx.link('https://github.com/example/app/pull/7');
  const afterHook = await ctx.readRows();
  const factsAfterHook = await ctx.listFacts('boxxy.pull_request.linked');

  ctx.forge.setDown(false);

  const report = await ctx.watch();
  const afterWatch = await ctx.readRows();
  const factsAfterWatch = await ctx.listFacts('boxxy.pull_request.linked');

  expect(answer).toStrictEqual({ kind: 'retry' });

  expect([
    afterHook.pullRequests,
    afterHook.evidence.map((row) => row.kind),
    factsAfterHook,
  ]).toStrictEqual([[], ['test'], []]);

  expect(report.linked).toBe(1);

  expect([
    afterWatch.pullRequests.map((row) => [row.number, row.githubId]),
    afterWatch.evidence.filter((row) => row.kind === 'pull_request').map((row) => row.source),
    factsAfterWatch.length,
  ]).toStrictEqual([[[7, 9_000_007]], ['watch'], 1]);
});

test('it refuses and writes nothing when a newer attempt takes the session during the forge read', async () => {
  const ctx = await setupTest();

  ctx.addOpenPullRequest(7);

  const hold = ctx.forge.holdNextRead();
  const pending = ctx.link('https://github.com/example/app/pull/7');

  await hold.entered;

  await ctx.seedReworkAfter(ctx.attempt);

  hold.release();

  const answer = await pending;
  const facts = await ctx.listFacts('boxxy.pull_request.linked');

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'not-current' });
  expect(facts).toStrictEqual([]);
});

test('it refuses a call from an older attempt of the session and never reads the forge', async () => {
  const ctx = await setupTest();

  ctx.addOpenPullRequest(7);

  await ctx.seedReworkAfter(ctx.attempt);

  const answer = await ctx.link('https://github.com/example/app/pull/7');

  expect({ answer, calls: ctx.forge.calls }).toStrictEqual({
    answer: { kind: 'refused', reason: 'not-current' },
    calls: [],
  });
});

test('it answers retry for a pull request the forge does not know yet', async () => {
  const ctx = await setupTest();
  const answer = await ctx.link('https://github.com/example/app/pull/7');

  expect(answer).toStrictEqual({ kind: 'retry' });
});

test('it answers a repeat and writes nothing for a pull request already linked', async () => {
  const ctx = await setupTest();

  ctx.addOpenPullRequest(7);

  await ctx.link('https://github.com/example/app/pull/7');

  const repeat = await ctx.link('https://github.com/example/app/pull/7/files');

  expect(repeat).toStrictEqual({ kind: 'linked', repo: ctx.repo, number: 7, repeat: true });

  const facts = await ctx.listFacts('boxxy.pull_request.linked');

  expect(facts).toHaveLength(1);
});

test('it answers a repeat and writes nothing for a pull request linked again with its repo in another case', async () => {
  const ctx = await setupTest();

  ctx.addOpenPullRequest(7);

  await ctx.link('https://github.com/Example/App/pull/7');

  const repeat = await ctx.link('https://github.com/example/app/pull/7');
  const facts = await ctx.listFacts('boxxy.pull_request.linked');

  expect([repeat, facts.length]).toStrictEqual([
    { kind: 'linked', repo: ctx.repo, number: 7, repeat: true },
    1,
  ]);
});

test('it records a merge at once for a pull request the forge shows merged', async () => {
  const ctx = await setupTest();

  ctx.forge.seed({
    ref: { repo: ctx.repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'merged',
      mergedAt: brandSchemas.instant.parse(1_800_000_000_000),
      mergeCommit: brandSchemas.commitSha.parse('b'.repeat(40)),
      commits: [],
    },
  });

  await ctx.link('https://github.com/example/app/pull/7');

  const merged = await ctx.listFacts('boxxy.pull_request.merged');

  expect(merged.map((fact) => fact.payload)).toStrictEqual([
    {
      attempt: ctx.attempt.id,
      repo: ctx.repo,
      number: 7,
      pullRequestId: '9000007',
      mergedAt: 1_800_000_000_000,
      mergeCommit: 'b'.repeat(40),
    },
  ]);
});

test.each([
  ['an address that is not a pull request', 'https://github.com/example/app/issues/7'],
  ['text that is not an address', 'pull 7'],
  ['a pull request of another repo', 'https://github.com/example/other/pull/7'],
])('it refuses %s', async (_title, url) => {
  const ctx = await setupTest();
  const answer = await ctx.link(url);

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'not-a-pull-request-url' });
  expect(ctx.forge.calls).toStrictEqual([]);
});
