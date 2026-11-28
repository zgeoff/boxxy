import { expect, expectTypeOf, test } from 'bun:test';
import type { BoxxyClient } from '@boxxy/contract';
import type { BindAnswer } from '@boxxy/dispatch';
import { attemptSummarySchema, brandSchemas } from '@boxxy/model';
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

    const body: unknown = await response.json();

    return { status: response.status, body };
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

test('#evidence answers the first evidence ID and writes nothing when a session sends the same evidence again', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const input = { session: { attempt: attempt.id }, kind: 'test', ref: 'bun test' };

  ctx.callerProof.setCaller(attempt.caller);

  const first = await ctx.callSession('attempt.evidence', input);
  const repeat = await ctx.callSession('attempt.evidence', input);
  const recorded = await ctx.deps.store.read((tx) => tx.listEvidence(attempt.id));

  expect(repeat).toStrictEqual(first);

  expect(repeat).toStrictEqual({
    status: 200,
    body: { json: { kind: 'recorded', factId: expect.any(String) } },
  });

  expect(recorded).toHaveLength(1);
});

test('#evidence records a check that passed at the head of the linked pull request', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('c'.repeat(40));

  ctx.callerProof.setCaller(attempt.caller);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [], head },
  });

  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  await ctx.recordPullRequest(attempt.id, 'https://github.com/example/app/pull/7');

  const answer = await ctx.callSession('attempt.evidence', {
    session: { attempt: attempt.id },
    kind: 'check',
    ref: 'pr / checks',
  });

  const recorded = await ctx.deps.store.read((tx) => tx.listEvidence(attempt.id));

  expect(answer).toStrictEqual({
    status: 200,
    body: { json: { kind: 'recorded', factId: expect.any(String) } },
  });

  expect(recorded.map((row) => [row.kind, row.ref, row.head])).toContainEqual([
    'check',
    'pr / checks',
    head,
  ]);
});

test('#evidence answers why a check that is still running is refused', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('c'.repeat(40));

  ctx.callerProof.setCaller(attempt.caller);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [], head },
  });

  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'pending' } });

  await ctx.recordPullRequest(attempt.id, 'https://github.com/example/app/pull/7');

  const answer = await ctx.callSession('attempt.evidence', {
    session: { attempt: attempt.id },
    kind: 'check',
    ref: 'pr / checks',
  });

  expect(answer).toStrictEqual({
    status: 200,
    body: {
      json: { kind: 'refused', reason: 'check-pending', check: 'pr / checks', head },
    },
  });
});

test.each(['check', 'verdict'] as const)(
  '#evidence rejects a %s that sends observed text',
  async (kind) => {
    const ctx = await setupTest();
    const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

    ctx.callerProof.setCaller(attempt.caller);

    const answer = await ctx.callSession('attempt.evidence', {
      session: { attempt: attempt.id },
      kind,
      ref: 'pr / checks',
      observed: 'it passed',
    });

    expect(answer.status).toBe(400);
    expect(ctx.forge.calls).toStrictEqual([]);
  },
);

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

test('#getItem takes the short reference of an item in place of its ID', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const toggle = await ctx.fileItem({
    repo: 'example/app',
    title: 'Add a theme toggle',
    outcome: 'The header has a theme toggle.',
  });

  ctx.callerProof.setCaller(attempt.caller);

  const byID = await ctx.callSession('attempt.getItem', { item: toggle });

  const viewSchema = z.object({ ref: z.string() });
  const jsonSchema = z.object({ item: viewSchema });
  const refSchema = z.object({ body: z.object({ json: jsonSchema }) });
  const shortRef = refSchema.parse(byID).body.json.item.ref;

  const byRef = await ctx.callSession('attempt.getItem', { item: shortRef });

  expect(byRef).toStrictEqual(byID);
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

test.each([['attempt.listItems'], ['attempt.getItem']])(
  'it leaves the kept session of another item out of %s',
  async (procedure) => {
    const ctx = await setupTest();
    const built = await ctx.dispatch.seedBuild();
    const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

    ctx.callerProof.setCaller(attempt.caller);

    const answer = await ctx.callSession(procedure, { item: built.item });

    const text = JSON.stringify(answer.body);

    expect({ status: answer.status, holdsKeptSession: text.includes('keptSession') }).toStrictEqual(
      { status: 200, holdsKeptSession: false },
    );
  },
);

test.each([
  ['a held item of the same repo', 'example/app', { reason: 'still a draft' }],
  ['an item of another repo', 'example/site', undefined],
])('#getItem leaves out a relation to %s', async (_label, repo, held) => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const hidden = await ctx.fileItem({
    repo,
    title: 'Add an export format',
    outcome: 'The export takes another format.',
    ...(held === undefined ? {} : { held }),
  });

  await ctx.owner(
    buildRPCRequest({
      procedure: 'relation.add',
      input: { source: attempt.item, type: 'relates-to', target: hidden },
    }),
  );

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.getItem', { item: attempt.item });

  expect(answer).toMatchObject({ status: 200, body: { json: { kind: 'item', relations: [] } } });
});

test('#getItem keeps a relation to a visible item of the same repo', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  const toggle = await ctx.fileItem({
    repo: 'example/app',
    title: 'Add a theme toggle',
    outcome: 'The header has a theme toggle.',
  });

  await ctx.owner(
    buildRPCRequest({
      procedure: 'relation.add',
      input: { source: toggle, type: 'relates-to', target: attempt.item },
    }),
  );

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.getItem', { item: attempt.item });

  expect(answer).toMatchObject({
    status: 200,
    body: { json: { relations: [{ source: toggle, target: attempt.item, type: 'relates-to' }] } },
  });
});

test('it answers a bind with exactly the kinds that the bind of dispatch gives', () => {
  type WireBind = Awaited<ReturnType<BoxxyClient['attempt']['bindSession']>>;

  expectTypeOf<WireBind['kind']>().toEqualTypeOf<BindAnswer['kind']>();
});

test('#current answers the attempt as a summary and keeps the input beside it', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  ctx.callerProof.setCaller(attempt.caller);

  const answer = await ctx.callSession('attempt.current', {});

  const shape = z.object({ json: z.object({ attempt: attemptSummarySchema, input: z.unknown() }) });
  const current = shape.parse(answer.body).json;

  expect([current.attempt.phase, current.attempt.state, current.input]).toStrictEqual([
    attempt.phase,
    attempt.state,
    attempt.input,
  ]);
});

test('#get returns the attempt in full, with its launch prompt and input', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const response = await ctx.owner(
    buildRPCRequest({ procedure: 'attempt.get', input: { attempt: attempt.id } }),
  );

  const body: unknown = await response.json();

  const answer = z.object({ json: z.record(z.string(), z.unknown()) }).parse(body);

  expect(answer.json).toStrictEqual(
    expect.objectContaining({
      id: attempt.id,
      spawnRequest: attempt.spawnRequest,
      input: attempt.input,
    }),
  );
});

test.each([['0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f'], ['no-such-attempt']])(
  '#get answers NOT_FOUND for the unknown attempt %s',
  async (unknown) => {
    const ctx = await setupTest();

    const response = await ctx.owner(
      buildRPCRequest({ procedure: 'attempt.get', input: { attempt: unknown } }),
    );

    const body: unknown = await response.json();

    const answer = z.object({ json: z.object({ code: z.string() }) }).parse(body);

    expect(answer.json.code).toBe('NOT_FOUND');
  },
);
