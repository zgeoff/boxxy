import { expect, test } from 'bun:test';
import { loadJobRules } from '@boxxy/dispatch/test-utils/load-job-rules';
import { seedSignoffWait } from '@boxxy/dispatch/test-utils/seed-signoff-wait';
import { attemptSummarySchema, brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { renderReportComment } from '@wringer/core';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runCLI } from '../cli/run-cli.ts';
import { buildMockCLIDeps } from '../test-utils/build-mock-cli-deps.ts';
import { createTestCLI } from '../test-utils/create-test-cli.ts';
import { readJSONOutput } from '../test-utils/read-json-output.ts';

// The CLI three ways: with a fake `fetch` that keeps each request, against the real server
// (`items`, and `held` for held items), and against the real server on the job rules, whose tick
// merges a reviewed pull request (`mergeAtHead`).
async function setupTest() {
  const bodies: unknown[] = [];

  const send = async (request: Request): Promise<Response> => {
    const sent: unknown = await request.json();

    bodies.push(sent);

    return Response.json({ json: { item: 'i-1' } });
  };

  const cli = await createTestCLI();

  const filedSchema = z.object({ item: z.string() });
  const position = z.object({ kind: z.string(), phase: z.string().optional(), round: z.number() });
  const derived = z.object({ state: z.string() });
  const labels = z.array(z.string());
  const shownItem = z.object({ title: z.string(), labels, derived, position });
  const note = z.object({ text: z.string() });
  const relation = z.object({ source: z.string(), type: z.string(), target: z.string() });

  const shownSchema = z.object({
    item: shownItem,
    notes: z.array(note),
    relations: z.array(relation),
  });

  const attemptRef = z.object({ id: z.string() });
  const shownAttemptsSchema = z.object({ attempts: z.array(attemptRef) });
  const fullAttemptSchema = z.object({ spawnRequest: z.object({ prompt: z.string() }) });
  const listedItem = z.object({ labels });
  const listedSchema = z.object({ items: z.array(listedItem), next: z.string().nullable() });

  const fileItem = async (...flags: string[]) => {
    const result = await cli.run([
      'item',
      'file',
      '--repo',
      'example/app',
      '--title',
      'Follow the system theme',
      '--outcome',
      'The app follows the system theme.',
      ...flags,
    ]);

    return { result, item: readJSONOutput(result, filedSchema).item };
  };

  const heldCLI = await createTestCLI();

  const heldDerived = z.object({ state: z.string(), reason: z.string().optional() });
  const heldAttempt = z.object({ phase: z.string() });

  const heldRevision = z.object({
    at: z.number(),
    actor: z.string(),
    changed: z.array(z.string()),
  });

  const heldShownSchema = z.object({
    item: z.object({ derived: heldDerived }),
    attempts: z.array(heldAttempt),
    revisions: z.array(heldRevision),
  });

  const nullableText = z.string().nullable();
  const refusal = z.object({ code: z.string(), problem: nullableText, message: z.string() });
  const refusedAttempt = z.object({ failure: nullableText, refusal: refusal.nullable() });
  const refusedShownSchema = z.object({ attempts: z.array(refusedAttempt) });

  const latestRefusal = z.object({
    at: z.string(),
    code: nullableText,
    problem: nullableText,
    message: nullableText,
  });

  const capacityRefusals = z.object({
    latest: latestRefusal.nullable(),
    sinceLastSpawn: z.number(),
  });

  const capacityStatusSchema = z.object({ capacityRefusals });
  const heldListedItem = z.object({ id: z.string(), derived: heldDerived });
  const heldListedSchema = z.object({ items: z.array(heldListedItem) });

  const fileHeldItem = async (...flags: string[]) => {
    const result = await heldCLI.run([
      'item',
      'file',
      '--repo',
      'example/app',
      '--title',
      'Draft a dark theme',
      '--outcome',
      'The app has a dark theme.',
      ...flags,
    ]);

    return readJSONOutput(result, filedSchema).item;
  };

  const showHeldItem = async (item: string) => {
    const shown = await heldCLI.run(['item', 'show', item]);

    return readJSONOutput(shown, heldShownSchema);
  };

  const mergeCLI = await createTestCLI();

  const mergeServer = mergeCLI.server;
  const rules = loadJobRules();

  mergeServer.dispatch.setRules(rules);

  const now = mergeServer.dispatch.clock.now();

  await mergeServer.deps.store.exclusive((tx) => tx.syncLimits(rules.limits, now));

  const signoffCLI = await createTestCLI();

  const mergeDerivedSchema = z.object({ state: z.string() });
  const mergeShowSchema = z.object({ item: z.object({ derived: mergeDerivedSchema }) });

  return {
    bodies,
    fileFlags: ['item', 'file', '--repo', 'acme/widgets', '--title', 'T', '--outcome', 'O'],
    run: (argv: readonly string[]) =>
      runCLI(
        {
          ...buildMockCLIDeps({ BOXXY_URL: 'http://boxxy.test' }),
          send,
          readStdin: () => Promise.resolve('Body from stdin'),
          readFile: (path) => Promise.resolve(`Body of ${path}`),
        },
        argv,
      ),
    items: {
      ...cli,
      fileItem,
      filedSchema,
      shownSchema,
      shownAttemptsSchema,
      fullAttemptSchema,
      listedSchema,
    },
    held: {
      ...heldCLI,
      fileItem: fileHeldItem,
      showItem: showHeldItem,
      listedSchema: heldListedSchema,
      refusedShownSchema,
      capacityStatusSchema,
    },
    signoff: {
      ...signoffCLI,
      createWaitingItem: () => seedSignoffWait(signoffCLI.server.dispatch, signoffCLI.server.forge),
    },
    mergeAtHead: {
      ...mergeCLI,
      readState: async (item: string) => {
        const shown = await mergeCLI.run(['item', 'show', item]);

        return readJSONOutput(shown, mergeShowSchema).item.derived.state;
      },
      countMergeFacts: async () => {
        const requested = await mergeServer.dispatch.listFacts('boxxy.merge.requested');
        const answered = await mergeServer.dispatch.listFacts('boxxy.merge.answered');
        const merged = await mergeServer.dispatch.listFacts('boxxy.pull_request.merged');

        return { requested: requested.length, answered: answered.length, merged: merged.length };
      },
    },
  };
}

test.each([
  ['--body text', ['--body', 'Typed body'], 'Typed body'],
  [
    '--body-file a path',
    ['--body-file', '/tmp/boxxy-test/body.md'],
    'Body of /tmp/boxxy-test/body.md',
  ],
  ['--body-file -', ['--body-file', '-'], 'Body from stdin'],
])('it sends the body of item file given as %s', async (_title, flags, expected) => {
  const ctx = await setupTest();

  await ctx.run([...ctx.fileFlags, ...flags]);

  expect(ctx.bodies).toStrictEqual([{ json: expect.objectContaining({ body: expected }) }]);
});

test('it sends no body for item edit when no body flag is given', async () => {
  const ctx = await setupTest();

  await ctx.run(['item', 'edit', 'i-1', '--title', 'A new title']);

  expect(ctx.bodies).toStrictEqual([{ json: { item: 'i-1', title: 'A new title' } }]);
});

test('it sends the body of item edit from a file', async () => {
  const ctx = await setupTest();

  await ctx.run(['item', 'edit', 'i-1', '--body-file', 'body.md']);

  expect(ctx.bodies).toStrictEqual([{ json: { item: 'i-1', body: 'Body of body.md' } }]);
});

test('it sends the security mark of item file given --security', async () => {
  const ctx = await setupTest();

  await ctx.run([...ctx.fileFlags, '--security']);

  expect(ctx.bodies).toStrictEqual([{ json: expect.objectContaining({ security: true }) }]);
});

test.each([
  ['--security', true],
  ['--no-security', false],
])('it sends the security mark of item edit given %s', async (flag, expected) => {
  const ctx = await setupTest();

  await ctx.run(['item', 'edit', 'i-1', flag]);

  expect(ctx.bodies).toStrictEqual([{ json: { item: 'i-1', security: expected } }]);
});

test('it exits 2 when item edit gets both --security and --no-security', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['item', 'edit', 'i-1', '--security', '--no-security']);

  expect([result, ctx.bodies]).toStrictEqual([
    {
      exitCode: 2,
      stdout: '',
      stderr: 'error: --security and --no-security contradict each other; give one\n',
    },
    [],
  ]);
});

test('it exits 2 when item file gets both --body and --body-file', async () => {
  const ctx = await setupTest();
  const result = await ctx.run([...ctx.fileFlags, '--body', 'x', '--body-file', 'y']);

  expect([result, ctx.bodies]).toStrictEqual([
    { exitCode: 2, stdout: '', stderr: 'error: give --body or --body-file, not both\n' },
    [],
  ]);
});

test('#item file files an item that #item show then reads back', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem(
    '--acceptance',
    'The theme follows the system.',
    '--label',
    'ui',
  );

  const shown = await ctx.run(['item', 'show', filed.item]);

  expect({ exitCode: filed.result.exitCode, stderr: filed.result.stderr }).toStrictEqual({
    exitCode: 0,
    stderr: '',
  });

  expect(readJSONOutput(shown, ctx.shownSchema).item).toStrictEqual({
    title: 'Follow the system theme',
    labels: ['ui'],
    derived: { state: 'ready' },
    position: { kind: 'phase', phase: 'triage', round: 1 },
  });
});

test('#item file exits 2 and files nothing when --title is missing', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const result = await ctx.run(['item', 'file', '--repo', 'example/app', '--outcome', 'Done.']);
  const listed = await ctx.run(['item', 'list']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: missing --title\n',
  });

  expect(readJSONOutput(listed, ctx.listedSchema)).toStrictEqual({ items: [], next: null });
});

test('#item edit changes the fields it is given and keeps the others', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem('--label', 'ui');
  const edited = await ctx.run(['item', 'edit', filed.item, '--title', 'Follow the OS theme']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(edited, ctx.filedSchema)).toStrictEqual({ item: filed.item });

  expect(readJSONOutput(shown, ctx.shownSchema).item).toStrictEqual({
    title: 'Follow the OS theme',
    labels: ['ui'],
    derived: { state: 'ready' },
    position: { kind: 'phase', phase: 'triage', round: 1 },
  });
});

test('#item list lists only the items with the label', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  await ctx.fileItem('--label', 'ui');
  await ctx.fileItem('--label', 'infra');

  const listed = await ctx.run(['item', 'list', '--label', 'infra', '--limit', '5']);

  expect(readJSONOutput(listed, ctx.listedSchema)).toStrictEqual({
    items: [{ labels: ['infra'] }],
    next: null,
  });
});

test('#item list exits 2 for a state that does not exist', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const result = await ctx.run(['item', 'list', '--state', 'sleepy']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr:
      'error: --state takes one of: held, idea, ready, blocked, running, waiting, done, archived\n',
  });
});

test('#item note appends a note that #item show lists', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem();
  const noted = await ctx.run(['item', 'note', filed.item, '--text', 'Ask the owner first.']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(noted, z.json())).toStrictEqual({ item: filed.item, seq: 1 });

  expect(readJSONOutput(shown, ctx.shownSchema).notes).toStrictEqual([
    { text: 'Ask the owner first.' },
  ]);
});

test('#item close closes an item that #item show then reports as archived', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem();
  const closed = await ctx.run(['item', 'close', filed.item, '--reason', 'no longer wanted']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(closed, z.json())).toStrictEqual({ item: filed.item, ended: [] });
  expect(readJSONOutput(shown, ctx.shownSchema).item.derived.state).toBe('archived');
});

test('#item close with --of adds a duplicate-of relation to the other item', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const first = await ctx.fileItem();
  const second = await ctx.fileItem();

  await ctx.run(['item', 'close', second.item, '--reason', 'duplicate', '--of', first.item]);

  const shown = await ctx.run(['item', 'show', second.item]);

  expect(readJSONOutput(shown, ctx.shownSchema).relations).toStrictEqual([
    { source: second.item, type: 'duplicate-of', target: first.item },
  ]);
});

test('#item retry sends the item to the given phase', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem();
  const retried = await ctx.run(['item', 'retry', filed.item, '--phase', 'build']);
  const shown = await ctx.run(['item', 'show', filed.item]);

  expect(readJSONOutput(retried, z.json())).toStrictEqual({ lever: expect.any(Number) });

  expect(readJSONOutput(shown, ctx.shownSchema).item.position).toStrictEqual({
    kind: 'phase',
    phase: 'build',
    round: 2,
  });
});

test.each([
  [
    'triage',
    {
      result: { kind: 'needs-owner', question: 'Light or dark by default? The toggle is settled.' },
      relations: [],
      friction: [],
    },
  ],
  [
    'design',
    {
      result: { kind: 'blocked', reason: 'Light or dark by default? The toggle is settled.' },
      friction: [],
    },
  ],
  [
    'build',
    {
      result: { kind: 'blocked', reason: 'Light or dark by default? The toggle is settled.' },
      criteria: [],
      openItems: [],
      friction: [],
    },
  ],
])(
  '#item retry starts a %s whose prompt holds where the last attempt stopped',
  async (phase, body) => {
    const setup = await setupTest();

    const ctx = setup.items;

    const blocked = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse(phase));

    ctx.server.callerProof.setCaller(blocked.caller);

    await ctx.run(['attempt', 'close-out'], { stdin: JSON.stringify(body) });

    ctx.server.dispatch.worker.setSession(blocked.id, {
      state: 'running',
      attention: 'turn-ended',
    });

    await ctx.server.tick();
    await ctx.server.tick();
    await ctx.run(['item', 'note', blocked.item, '--text', 'Dark by default.']);
    await ctx.run(['item', 'retry', blocked.item]);
    await ctx.server.tick();

    const shown = await ctx.run(['item', 'show', blocked.item]);

    const latest = readJSONOutput(shown, ctx.shownAttemptsSchema).attempts.at(-1);

    const full = await ctx.run(['attempt', 'get', latest?.id ?? '']);

    expect(readJSONOutput(full, ctx.fullAttemptSchema).spawnRequest.prompt).toContain(
      [
        '## Where the last attempt stopped',
        'Light or dark by default? The toggle is settled.',
        '## Notes from the owner',
        '- 1970-01-01: Dark by default.',
      ].join('\n\n'),
    );
  },
);

test('#item retry exits 1 and names the code for a phase the pipeline lacks', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem();
  const result = await ctx.run(['item', 'retry', filed.item, '--phase', 'ship']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: UNKNOWN_PHASE: the pipeline of the item has no such phase\n',
  });
});

test('#item file exits 1 and names the repo that the server configuration does not name', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const result = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/widget',
    '--title',
    'Check a widget',
    '--outcome',
    'The widget passes.',
  ]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr:
      'error: REPO_NOT_CONFIGURED: the server configuration names no such repository ' +
      '{"repo":"example/widget"}\n',
  });
});

test('#item wake answers not-sleeping for an item with no sleeping attempt', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const filed = await ctx.fileItem();
  const result = await ctx.run(['item', 'wake', filed.item]);

  expect(readJSONOutput(result, z.json())).toStrictEqual({ kind: 'not-sleeping' });
});

test('#item show lists each attempt as a summary without its launch prompt or input', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const attempt = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('build'));
  const shown = await ctx.run(['item', 'show', attempt.item]);

  const shape = z.object({ attempts: z.array(attemptSummarySchema) });
  const attempts = readJSONOutput(shown, shape).attempts;

  expect(
    attempts.map((listed) => [listed.id, listed.phase, listed.number, listed.state]),
  ).toStrictEqual([[attempt.id, attempt.phase, attempt.number, attempt.state]]);
});

test('#item show exits 1 and names the item that does not exist', async () => {
  const setup = await setupTest();

  const ctx = setup.items;

  const result = await ctx.run(['item', 'show', 'i-404']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: NOT_FOUND: no such item {"item":"i-404"}\n',
  });
});

test('#item file --held files an item that a tick leaves unstarted', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem('--held', 'still a draft');

  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect([shown.item.derived, shown.attempts]).toStrictEqual([
    { state: 'held', reason: 'still a draft' },
    [],
  ]);
});

test('#expedite leaves a held item unstarted', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem('--held', 'still a draft');

  await ctx.run(['expedite', item, '--reason', 'try to pull the draft']);
  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect([shown.item.derived.state, shown.attempts]).toStrictEqual(['held', []]);
});

test('#item retry exits 1 for a held item, so its release still starts at triage', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem('--held', 'still a draft', '--acceptance', 'It is dark.');
  const retried = await ctx.run(['item', 'retry', item, '--phase', 'build']);

  await ctx.run(['item', 'release', item]);
  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect({ exitCode: retried.exitCode, stderr: retried.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: ITEM_HELD: the item is held; release it with item_release first\n',
  });

  expect(shown.attempts).toStrictEqual([{ phase: 'triage' }]);
});

test('#item release releases a held item, and the next tick starts its triage', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem('--held', 'still a draft');
  const released = await ctx.run(['item', 'release', item]);

  await ctx.server.tick();

  const shown = await ctx.showItem(item);

  expect(readJSONOutput(released, z.json())).toStrictEqual({ kind: 'released', item });

  expect([shown.item.derived.state, shown.attempts]).toStrictEqual([
    'running',
    [{ phase: 'triage' }],
  ]);
});

test('#item release exits 1 with a refusal for an item that is not held', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem();
  const result = await ctx.run(['item', 'release', item]);

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: `${JSON.stringify({ kind: 'refused', reason: 'not-held' }, null, 2)}\n`,
  });
});

test('#item list --held lists the held items only', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const held = await ctx.fileItem('--held', 'still a draft');

  await ctx.fileItem();

  const listed = await ctx.run(['item', 'list', '--held']);

  expect(readJSONOutput(listed, ctx.listedSchema).items).toStrictEqual([
    { id: held, derived: { state: 'held', reason: 'still a draft' } },
  ]);
});

test('#item list exits 2 for --held with another --state', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const result = await ctx.run(['item', 'list', '--held', '--state', 'ready']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: --held lists held items only, so it takes no other --state\n',
  });
});

test('#item show lists the revisions of a held item that #item edit made', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem('--held', 'still a draft');

  await ctx.run(['item', 'edit', item, '--title', 'Draft a dark mode', '--label', 'ui']);
  await ctx.run(['item', 'note', item, '--text', 'Match the system setting.']);

  const shown = await ctx.showItem(item);

  expect([shown.item.derived.state, shown.revisions]).toStrictEqual([
    'held',
    [{ at: expect.any(Number), actor: 'boxxy:owner:local', changed: ['labels', 'title'] }],
  ]);
});

test('it merges a reviewed pull request at its head through the server tick, and the item reads done', async () => {
  const setup = await setupTest();

  const ctx = setup.mergeAtHead;
  const server = ctx.server;
  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('5d0c1a2b3e4f5061728394a5b6c7d8e9f0a1b2c3');

  const build = await server.dispatch.seedBuildWithPullRequest(server.forge, 7);

  server.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Follow the system theme' }],
    },
    body: [
      'Follow the system theme.',
      '',
      renderReportComment({
        version: 2,
        registry: 'boxxy-verify',
        base: 'origin/main',
        fingerprint: '0f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c',
        claims: [],
      }),
    ].join('\n'),
  });

  server.forge.seedRequiredChecks({ repo, branch: 'main', checks: ['build'] });

  server.forge.seedChecks({
    repo,
    head,
    checks: { 'pr / checks': 'success', build: 'success', 'verify / gate': 'success' },
  });

  const review = await server.dispatch.claim();

  invariant(review !== null, 'the review claims after the build');

  const reviewRow = await server.dispatch.readAttempt(review.attempt.id);

  await server.dispatch.closeAndSettle(reviewRow, {
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({ status: 'passed', head }),
    unrelatedLines: null,
  });

  await server.tick();

  server.dispatch.clock.advance(30_000);

  await server.tick();

  const settledFacts = await ctx.countMergeFacts();

  await server.watch();

  const seen: unknown = {
    merges: server.forge.calls.filter((call) => call.startsWith('mergeAtHead')),
    settledFacts,
    watchedFacts: await ctx.countMergeFacts(),
    state: await ctx.readState(build.item),
    logged: server.logged,
  };

  expect(seen).toStrictEqual({
    merges: [`mergeAtHead example/app#7 ${head} squash`],
    settledFacts: { requested: 1, answered: 1, merged: 1 },
    watchedFacts: { requested: 1, answered: 1, merged: 1 },
    state: 'done',
    logged: [],
  });
});

test('#item show and #status show why atc refused a spawn for capacity', async () => {
  const setup = await setupTest();

  const ctx = setup.held;

  const item = await ctx.fileItem();

  const refusal = { code: 'host_unavailable', problem: 'ram_budget_exceeded', message: 'no pages' };

  ctx.server.dispatch.worker.failNext('start', {
    kind: 'refused',
    cause: 'capacity',
    reason: 'host_unavailable (ram_budget_exceeded): no pages',
    refusal,
  });

  await ctx.server.tick();

  const shown = await ctx.run(['item', 'show', item]);
  const status = await ctx.run(['status']);

  expect([
    readJSONOutput(shown, ctx.refusedShownSchema).attempts,
    readJSONOutput(status, ctx.capacityStatusSchema).capacityRefusals,
  ]).toStrictEqual([
    [{ failure: 'no-capacity', refusal }],
    {
      latest: {
        at: new Date(ctx.server.dispatch.clock.now()).toISOString(),
        code: 'host_unavailable',
        problem: 'ram_budget_exceeded',
        message: 'no pages',
      },
      sinceLastSpawn: 1,
    },
  ]);
});

test('#signoff list lists the item that waits with its head, and #item signoff approve merges it at that head', async () => {
  const setup = await setupTest();

  const ctx = setup.signoff;

  const seeded = await ctx.createWaitingItem();
  const listed = await ctx.run(['signoff', 'list']);

  ctx.server.dispatch.clock.advance(1000);

  const approved = await ctx.run([
    'item',
    'signoff',
    seeded.item,
    '--head',
    seeded.head,
    '--verdict',
    'approve',
  ]);

  await ctx.server.tick();

  ctx.server.dispatch.clock.advance(30_000);

  await ctx.server.tick();

  const seen: unknown = {
    listed: readJSONOutput(listed, z.json()),
    approved: [approved.exitCode, readJSONOutput(approved, z.json())],
    merges: ctx.server.forge.calls.filter((call) => call.startsWith('mergeAtHead')),
  };

  expect(seen).toStrictEqual({
    listed: {
      items: [
        {
          item: seeded.item,
          title: expect.any(String),
          pullRequest: { repo: 'example/app', number: 7 },
          head: seeded.head,
          rules: ['skills'],
          paths: ['skills/testing/SKILL.md'],
          truncated: false,
          since: expect.any(Number),
        },
      ],
    },
    approved: [0, { lever: expect.any(Number) }],
    merges: [`mergeAtHead example/app#7 ${seeded.head} squash`],
  });
});

test('#item signoff exits 1 with STALE_HEAD for a head other than the one that waits', async () => {
  const setup = await setupTest();

  const ctx = setup.signoff;

  const seeded = await ctx.createWaitingItem();

  const result = await ctx.run([
    'item',
    'signoff',
    seeded.item,
    '--head',
    '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    '--verdict',
    'approve',
  ]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr:
      'error: STALE_HEAD: the pull request head is not the one that waits for a sign-off {"head":"e83c5163316f89bfbde7d9ab23ca2e25604af290"}\n',
  });
});

test('#item signoff sends back with findings read from stdin', async () => {
  const setup = await setupTest();

  const ctx = setup.signoff;

  const seeded = await ctx.createWaitingItem();

  ctx.server.dispatch.clock.advance(1000);

  const result = await ctx.run(
    [
      'item',
      'signoff',
      seeded.item,
      '--head',
      seeded.head,
      '--verdict',
      'send-back',
      '--findings-file',
      '-',
    ],
    { stdin: 'The new rule contradicts the old one.' },
  );

  const facts = await ctx.server.dispatch.listFacts('boxxy.lever.recorded');

  expect(result.exitCode).toBe(0);

  expect(facts.map((fact) => fact.payload)).toContainEqual(
    expect.objectContaining({
      kind: 'signoff.send-back',
      reason: 'The new rule contradicts the old one.',
    }),
  );
});

test('it exits 2 when item signoff gets both --findings and --findings-file', async () => {
  const setup = await setupTest();

  const result = await setup.run([
    'item',
    'signoff',
    'i-1',
    '--head',
    'abc',
    '--verdict',
    'send-back',
    '--findings',
    'x',
    '--findings-file',
    'y',
  ]);

  expect(result).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'error: give --findings or --findings-file, not both\n',
  });
});
