import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const server = await createTestServer();

  return {
    ...server,
    recordPullRequest: async (attempt: string, url: string) => {
      const response = await server.worker(
        buildRPCRequest({
          procedure: 'attempt.recordPullRequest',
          input: { session: { attempt }, url },
          token: server.workerToken,
        }),
      );

      return { status: response.status, body: await response.json() };
    },
    readWatched: () => server.deps.store.read((tx) => tx.listWatchedPullRequests()),
  };
}

test('#recordPullRequest links the pull request the forge knows to the calling attempt', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const repo = brandSchemas.repoName.parse('example/app');

  ctx.callerProof.setCaller(attempt.caller);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const answer = await ctx.recordPullRequest(attempt.id, 'https://github.com/example/app/pull/7');

  expect(answer).toStrictEqual({
    status: 200,
    body: { json: { kind: 'linked', repo: 'example/app', number: 7, repeat: false } },
  });

  const watched = await ctx.readWatched();

  expect(watched.map((row) => row.attempt)).toStrictEqual([attempt.id]);
});

test('#recordPullRequest refuses a pull request that another item linked', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));
  const second = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const repo = brandSchemas.repoName.parse('example/app');

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  ctx.callerProof.setCaller(first.caller);

  await ctx.recordPullRequest(first.id, 'https://github.com/example/app/pull/7');

  ctx.callerProof.setCaller(second.caller);

  const answer = await ctx.recordPullRequest(second.id, 'https://github.com/example/app/pull/7');

  expect(answer).toStrictEqual({
    status: 200,
    body: { json: { kind: 'refused', reason: 'linked-elsewhere' } },
  });
});

test('#recordPullRequest answers retry and writes nothing while the forge is down', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  ctx.callerProof.setCaller(attempt.caller);
  ctx.forge.setDown(true);

  const answer = await ctx.recordPullRequest(attempt.id, 'https://github.com/example/app/pull/7');
  const watched = await ctx.readWatched();

  expect(answer).toStrictEqual({ status: 200, body: { json: { kind: 'retry' } } });
  expect(watched).toStrictEqual([]);
});

test('#recordPullRequest refuses a link when a newer attempt takes the session during the forge read', async () => {
  const ctx = await setupTest();
  const first = await ctx.dispatch.seedBuild();

  ctx.callerProof.setCaller(first.caller);

  ctx.forge.seed({
    ref: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const hold = ctx.forge.holdNextRead();
  const pending = ctx.recordPullRequest(first.id, 'https://github.com/example/app/pull/7');

  await hold.entered;

  await ctx.dispatch.seedReworkAfter(first);

  hold.release();

  const answer = await pending;
  const watched = await ctx.readWatched();

  expect(answer).toStrictEqual({
    status: 200,
    body: { json: { kind: 'refused', reason: 'not-current' } },
  });

  expect(watched).toStrictEqual([]);
});

test('#recordPullRequest refuses another attempt and never reads the forge', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.recordPullRequest(
    '00000000-0000-7000-8000-000000000001',
    'https://github.com/example/app/pull/7',
  );

  expect({ answer, calls: ctx.forge.calls }).toStrictEqual({
    answer: { status: 200, body: { json: { kind: 'refused', reason: 'not-current' } } },
    calls: [],
  });
});
