import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillsRepo } from '@boxxy/cli/test-utils/create-skills-repo';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import type { AttemptRow, ItemId } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';
import { runOutboxSender } from '../src/test-utils/run-outbox-sender.ts';
import { startPepysUnderTest } from '../src/test-utils/start-pepys-under-test.ts';

interface SessionScript {
  readonly item: ItemId;
  readonly source: 'startup' | 'resume';

  // the item's wait in the queue before the tick that claims it
  readonly queueMinutes: number;
  readonly workMinutes: number;
  readonly closeOut: () => Promise<unknown>;
}

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-journey-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const pepys = await startPepysUnderTest();

  onTestFinished(() => pepys[Symbol.asyncDispose]());

  const cli = await createTestCLI({ store, pepys: pepys.reader });

  const server = cli.server;
  const minuteMs = 60_000;
  const startedAt = server.dispatch.clock.now();

  const skills = await createSkillsRepo({
    folder: join(folder, 'remote'),
    skills: { 'bake-off': { 'SKILL.md': 'Sketch three designs.\n' } },
  });

  server.dispatch.setRules({
    ...server.dispatch.rules(),
    skills: { source: skills.source, ref: brandSchemas.commitSha.parse(skills.ref) },
  });

  const workspace = join(folder, 'workspace');

  const readLiveAttempt = async (item: ItemId): Promise<AttemptRow> => {
    const live = await server.deps.store.read((tx) => tx.listLiveAttempts());

    const attempt = live.find((row) => row.item === item);

    invariant(attempt !== undefined, 'the tick claimed and started an attempt of the item');

    return attempt;
  };

  // One scripted session on the fake worker: the tick claims and starts it, the hook binds it,
  // the agent works and closes out, its turn ends, and two ticks stop and settle the attempt.
  const runSession = async (script: SessionScript) => {
    server.dispatch.clock.advance(script.queueMinutes * minuteMs);

    await server.tick();

    const attempt = await readLiveAttempt(script.item);

    invariant(attempt.caller !== null, 'the fake worker reports the caller of each session');

    server.callerProof.setCaller(attempt.caller);

    const reading = await server.dispatch.worker.reconcile(attempt);

    invariant(reading.kind === 'running', 'the started session runs');

    const started = await cli.run(['hook', 'session-start'], {
      stdin: JSON.stringify({
        session_id: reading.agentSession,
        cwd: workspace,
        hook_event_name: 'SessionStart',
        source: script.source,
      }),
      env: { BOXXY_SKILLS_URL: skills.baseURL },
    });

    server.dispatch.clock.advance(script.workMinutes * minuteMs);

    const body = await script.closeOut();
    const closed = await cli.run(['attempt', 'close-out'], { stdin: JSON.stringify(body) });

    server.dispatch.worker.setSession(attempt.id, { state: 'running', attention: 'turn-ended' });

    await server.tick();
    await server.tick();

    const settled = await server.dispatch.readAttempt(attempt.id);

    const outcome: string | null = settled.outcome;

    return { started, closed, attempt: settled, outcome };
  };

  const recordEvidence = async () => {
    const result = await cli.run([
      'attempt',
      'evidence',
      '--kind',
      'test',
      '--ref',
      'theme.test.ts: follows the system',
      '--observed',
      '12 passed',
    ]);

    return result.stdout.trim();
  };

  const createPullRequest = async () => {
    const result = await cli.run(['hook', 'post-tool-use'], {
      stdin: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'gh pr create --fill' },
        tool_response: {
          stdout: 'https://github.com/example/app/pull/7\n',
          stderr: '',
          interrupted: false,
          isImage: false,
        },
      }),
    });

    return result.stdout;
  };

  const acceptanceSchema = z.array(z.object({ id: z.string() }));
  const derivedSchema = z.object({ state: z.string() });

  const showSchema = z.object({
    item: z.object({ acceptance: acceptanceSchema, derived: derivedSchema }),
  });

  return {
    ...cli,
    pepys,
    runSession,
    recordEvidence,
    createPullRequest,
    showItem: async (item: ItemId) => {
      const shown = await cli.run(['item', 'show', item]);

      return readJSONOutput(shown, showSchema).item;
    },

    // the time the given number of minutes after the test started, as ISO 8601
    at: (minutes: number) => new Date(startedAt + minutes * minuteMs).toISOString(),
    advanceMinutes: (minutes: number) => server.dispatch.clock.advance(minutes * minuteMs),
  };
}

test('it takes an item through triage, design, build, review, one rework round and a merge', async () => {
  const ctx = await setupTest();

  const server = ctx.server;
  const repo = brandSchemas.repoName.parse('example/app');

  const filed = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/app',
    '--title',
    'Follow the system theme',
    '--outcome',
    'The app follows the system theme.',
    '--acceptance',
    'The app reads dark when the system does.',
  ]);

  const filedItem = readJSONOutput(filed, z.object({ item: z.string() })).item;
  const item = brandSchemas.itemId.parse(filedItem);

  const filedView = await ctx.showItem(item);

  const criterion = filedView.acceptance[0]?.id;

  // minutes 0 to 4: triage accepts the item for an agent-mode design
  const triage = await ctx.runSession({
    item,
    source: 'startup',
    queueMinutes: 0,
    workMinutes: 4,
    closeOut: () =>
      Promise.resolve({
        result: { kind: 'accepted' },
        set: { designMode: 'agent' },
        relations: [],
        friction: [],
      }),
  });

  expect([triage.started.exitCode, triage.closed.exitCode, triage.outcome]).toStrictEqual([
    0,
    0,
    'accepted',
  ]);

  // minutes 4 to 14: design fetches the pinned bake-off skill and designs
  const design = await ctx.runSession({
    item,
    source: 'startup',
    queueMinutes: 0,
    workMinutes: 10,
    closeOut: () =>
      Promise.resolve({
        result: { kind: 'designed', design: { text: 'Read the media query.', location: null } },
        friction: [],
      }),
  });

  expect([design.started.exitCode, design.outcome]).toStrictEqual([0, 'designed']);

  // minutes 14 to 44: the build opens a pull request, the hook links it, and the build is built
  server.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  let linked = '';

  const build = await ctx.runSession({
    item,
    source: 'startup',
    queueMinutes: 0,
    workMinutes: 30,
    closeOut: async () => {
      linked = await ctx.createPullRequest();

      const evidence = await ctx.recordEvidence();

      return {
        result: { kind: 'built' },
        criteria: [{ criterion, evidence }],
        openItems: [],
        friction: [],
      };
    },
  });

  expect([linked, build.attempt.state, build.outcome]).toStrictEqual([
    'boxxy linked example/app#7 to this attempt\n',
    'succeeded',
    'built',
  ]);

  // minutes 47 to 55: after 3 minutes in the queue, the first review leaves a finding open; the
  // server's review gate is a stand-in that reads the body as its reading
  const firstReading = buildMockGateReading({
    status: 'blocked',
    why: 'open-findings',
    open: { high: 1, medium: 0, low: 0 },
    findingPaths: ['src/theme.ts'],
  });

  const firstReview = await ctx.runSession({
    item,
    source: 'startup',
    queueMinutes: 3,
    workMinutes: 8,
    closeOut: () => Promise.resolve(toJSONValue(firstReading)),
  });

  expect(firstReview.outcome).toBe('changes-requested');

  // minutes 55 to 67: the rework round wakes the build's kept session
  const rework = await ctx.runSession({
    item,
    source: 'resume',
    queueMinutes: 0,
    workMinutes: 12,
    closeOut: async () => {
      const evidence = await ctx.recordEvidence();

      return {
        result: { kind: 'built' },
        criteria: [{ criterion, evidence }],
        openItems: [],
        friction: [],
      };
    },
  });

  const resumes = server.dispatch.worker.calls.filter((call) => call.method === 'resumeKept');

  expect({
    started: rework.started.exitCode,
    resumes: resumes.map((call) => call.subject),
    session: rework.attempt.atcSession,
    round: rework.attempt.round,
    outcome: rework.outcome,
  }).toStrictEqual({
    started: 0,
    resumes: [rework.attempt.id],
    session: build.attempt.atcSession,
    round: 2,
    outcome: 'built',
  });

  // minutes 69 to 75: after 2 minutes in the queue, the second review passes; the rework changed
  // the file of the finding and one other file
  const secondReading = buildMockGateReading({ status: 'passed' });

  server.forge.seedCompare({
    repo,
    from: firstReading.head,
    to: secondReading.head,
    files: [
      { path: 'src/theme.ts', changedLines: 12 },
      { path: 'src/menu.ts', changedLines: 3 },
    ],
  });

  const secondReview = await ctx.runSession({
    item,
    source: 'startup',
    queueMinutes: 2,
    workMinutes: 6,
    closeOut: () => Promise.resolve(toJSONValue(secondReading)),
  });

  const reviewed = await ctx.showItem(item);

  expect([
    secondReview.outcome,
    secondReview.attempt.closeOut,
    reviewed.derived.state,
  ]).toStrictEqual([
    'passed',
    { round: 2, cause: 'rework', reading: secondReading, unrelatedLines: 3 },
    'waiting',
  ]);

  // minute 95: the pull request merges; the forge shows it to boxxy's watch, and GitHub sends the
  // signed webhook to pepys
  const mergedAt = ctx.advanceMinutes(20);
  const mergeCommit = brandSchemas.commitSha.parse('d'.repeat(40));

  server.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'merged', mergedAt, mergeCommit, commits: [] },
  });

  const watched = await server.watch();
  const merged = await ctx.showItem(item);

  const webhook = await ctx.pepys.sendMergeWebhook({
    githubId: 9_000_007,
    repo: 'example/app',
    number: 7,
    title: 'Follow the system theme',
    openedAt: ctx.at(44),
    mergedAt: ctx.at(95),
    mergeCommit,
  });

  expect({
    merged: watched.merged,
    state: merged.derived.state,
    webhook: webhook.status,
  }).toStrictEqual({ merged: 1, state: 'done', webhook: 200 });

  // one model request a minute into each of three attempts, from the caller of its session
  const telemetry = [
    { attempt: build.attempt, minute: 15, costUSD: 1 },
    { attempt: firstReview.attempt, minute: 48, costUSD: 2 },
    { attempt: rework.attempt, minute: 56, costUSD: 3 },
  ].map((request, index) => {
    invariant(request.attempt.atcSession !== null && request.attempt.caller !== null, 'started');

    return {
      id: `request-${index + 1}`,
      session: request.attempt.atcSession,
      origin: request.attempt.caller,
      model: 'claude-opus-5-5',
      costUSD: request.costUSD,
      inputTokens: 1000,
      outputTokens: 200,
      at: ctx.at(request.minute),
    };
  });

  await ctx.pepys.sendTelemetry(telemetry);

  const steps = await runOutboxSender({
    store: server.deps.store,
    sink: ctx.pepys.sink,
    clock: server.dispatch.clock,
  });

  const counts = await server.deps.store.read((tx) => tx.readOutboxCounts());

  expect({ last: steps.at(-1), counts }).toStrictEqual({
    last: 'idle',
    counts: expect.objectContaining({ unsent: 0, parked: 0 }),
  });

  // both reports, through the CLI, the server and the reader, from that pepys
  const cost = await ctx.run(['cost', item]);
  const times = await ctx.run(['times', item]);

  const line = {
    product: 'claude_code',
    model: 'claude-opus-5-5',
    requests: 1,
    inputTokens: 1000,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 200,
    costBasis: 'reported',
  };

  expect({ exitCode: cost.exitCode, cost: readJSONOutput(cost, z.unknown()) }).toStrictEqual({
    exitCode: 0,
    cost: {
      item,
      landedAt: ctx.at(95),
      attempts: 6,
      lines: [
        { phase: 'build', rework: false, ...line, costUSD: 1 },
        { phase: 'build', rework: true, ...line, costUSD: 3 },
        { phase: 'review', rework: false, ...line, costUSD: 2 },
      ],
      totals: { requests: 3, costUSD: 6, reworkCostUSD: 3, requestsWithoutCost: 0 },
      behind: { facts: 0, oldestAt: null },
    },
  });

  expect({ exitCode: times.exitCode, times: readJSONOutput(times, z.unknown()) }).toStrictEqual({
    exitCode: 0,
    times: {
      item,
      environment: 'production',
      steps: [
        { step: 'triage', minutes: 4, endedAt: ctx.at(4) },
        { step: 'design', minutes: 10, endedAt: ctx.at(14) },
        { step: 'build', minutes: 30 + 12, endedAt: ctx.at(67) },
        { step: 'review', minutes: 8 + 6, endedAt: ctx.at(75) },
        { step: 'merge', minutes: 20, endedAt: ctx.at(95) },
        { step: 'release', minutes: null, endedAt: null },
        { step: 'deploy', minutes: null, endedAt: null },
      ],
      rework: { count: 1, minutes: 12 + 6, unrelatedLines: 3 },
      reviewWaitMinutes: 3 + 2,
      sleepMinutes: 0,
      pullRequests: ['github:pull_request:9000007'],
      behind: { facts: 0, oldestAt: null },
    },
  });
});
