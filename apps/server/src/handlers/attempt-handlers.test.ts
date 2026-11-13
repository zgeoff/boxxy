import { expect, expectTypeOf, test } from 'bun:test';
import type { BoxxyClient } from '@boxxy/contract';
import type { BindAnswer } from '@boxxy/dispatch';
import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const repos = ['example/app', 'example/site'].map((repo) => brandSchemas.repoName.parse(repo));

  const server = await createTestServer({ repos });

  const filedSchema = z.object({ json: z.object({ item: z.string() }) });
  const listedRef = z.object({ id: z.string() });

  const listedSchema = z.object({
    json: z.object({
      kind: z.string(),
      repo: z.string(),
      items: z.array(listedRef),
      next: z.string().nullable(),
    }),
  });

  const callSession = async (procedure: string, input: unknown) => {
    const response = await server.worker(
      buildRPCRequest({ procedure, input, token: server.workerToken }),
    );

    return { status: response.status, body: await response.json() };
  };

  return {
    ...server,
    callSession,

    // the answer of the session's item list, with each listed item as its ID
    listItems: async (input: unknown) => {
      const answer = await callSession('attempt.listItems', input);

      const json = listedSchema.parse(answer.body).json;

      return { status: answer.status, ...json, items: json.items.map((item) => item.id) };
    },
    fileItem: async (input: Readonly<Record<string, unknown>>) => {
      const response = await server.owner(buildRPCRequest({ procedure: 'item.file', input }));
      const body: unknown = await response.json();

      return filedSchema.parse(body).json.item;
    },
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

test('#listItems lists the items of the repo of the session, newest first, without held items', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const toggle = await ctx.fileItem({
    repo: 'example/app',
    title: 'Add a theme toggle',
    outcome: 'The header has a theme toggle.',
  });

  await ctx.fileItem({
    repo: 'example/app',
    title: 'Draft a new palette',
    outcome: 'The palette is chosen.',
    held: { reason: 'still a draft' },
  });

  await ctx.fileItem({
    repo: 'example/site',
    title: 'Add a dark theme to the site',
    outcome: 'The site has a dark theme.',
  });

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.listItems({});

  expect(answer).toStrictEqual({
    status: 200,
    kind: 'items',
    repo: 'example/app',
    items: [toggle, attempt.item],
    next: null,
  });
});

test('#listItems keeps to the repo of the session when the input names another repo', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  await ctx.fileItem({
    repo: 'example/site',
    title: 'Add a dark theme to the site',
    outcome: 'The site has a dark theme.',
  });

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.listItems({ repo: 'example/site' });

  expect(answer).toStrictEqual({
    status: 200,
    kind: 'items',
    repo: 'example/app',
    items: [attempt.item],
    next: null,
  });
});

test('#listItems matches the text in the title of an item', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const toggle = await ctx.fileItem({
    repo: 'example/app',
    title: 'Add a theme toggle',
    outcome: 'The header has a theme toggle.',
  });

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.listItems({ text: 'TOGGLE' });

  expect(answer.items).toStrictEqual([toggle]);
});

test('#listItems refuses the held state as a bad request', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.listItems', { state: 'held' });

  expect(answer).toMatchObject({ status: 400, body: { json: { code: 'BAD_REQUEST' } } });
});

test.each([['attempt.listItems'], ['attempt.getItem']])(
  'it answers no-attempt on %s to a caller that no session holds',
  async (procedure) => {
    const ctx = await setupTest();
    const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

    ctx.callerProof.setCaller({ issuer: 'https://imp.example', subject: 'imp-unknown' });

    const answer = await ctx.callSession(procedure, { item: attempt.item });

    expect(answer).toStrictEqual({
      status: 200,
      body: { json: { kind: 'refused', reason: 'no-attempt' } },
    });
  },
);

test('#getItem returns an item of the repo of the session with its body, notes, relations and pull requests', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const toggle = await ctx.fileItem({
    repo: 'example/app',
    title: 'Add a theme toggle',
    outcome: 'The header has a theme toggle.',
    body: 'Put the toggle beside the search box.',
  });

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.getItem', { item: toggle });

  expect(answer).toStrictEqual({
    status: 200,
    body: {
      json: {
        kind: 'item',
        item: expect.objectContaining({
          id: toggle,
          repo: 'example/app',
          body: 'Put the toggle beside the search box.',
        }),
        notes: [],
        relations: [],
        pullRequests: [],
      },
    },
  });
});

test.each([
  ['a held item of the same repo', 'example/app', { reason: 'still a draft' }],
  ['an item of another repo', 'example/site', undefined],
])('#getItem answers NOT_FOUND for %s', async (_label, repo, held) => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const item = await ctx.fileItem({
    repo,
    title: 'Add a dark theme',
    outcome: 'The pages have a dark theme.',
    ...(held === undefined ? {} : { held }),
  });

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.getItem', { item });

  expect(answer).toMatchObject({
    status: 404,
    body: { json: { code: 'NOT_FOUND', data: { item } } },
  });
});

test('#getItem answers NOT_FOUND for an item that does not exist', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.getItem', { item: 'i-999' });

  expect(answer).toMatchObject({
    status: 404,
    body: { json: { code: 'NOT_FOUND', data: { item: 'i-999' } } },
  });
});

test('it answers a bind with exactly the kinds that the bind of dispatch gives', () => {
  type WireBind = Awaited<ReturnType<BoxxyClient['attempt']['bindSession']>>;

  expectTypeOf<WireBind['kind']>().toEqualTypeOf<BindAnswer['kind']>();
});
