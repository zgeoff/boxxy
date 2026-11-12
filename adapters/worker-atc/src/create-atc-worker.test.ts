import { expect, onTestFinished, test } from 'bun:test';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { workerContract } from '@boxxy/dispatch/test-utils/worker-contract';
import type { AttemptId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { createAtcWorker } from './create-atc-worker.ts';
import { createAtcMcpClient } from './mcp/create-atc-mcp-client.ts';
import { createFakeAtcServer } from './test-utils/create-fake-atc-server.ts';
import { createFakeAtc } from './test-utils/create-fake-atc.ts';

function setupTest() {
  const clock = createFakeClock();
  const atc = createFakeAtc({ clock, targets: { box: 'suspending', laptop: 'local' } });
  const server = createFakeAtcServer({ atc, token: 'atcs_test-token-0123', host: 'atc.test' });

  onTestFinished(() => server.stop());

  const client = createAtcMcpClient({
    url: server.url,
    host: 'atc.test',
    token: 'atcs_test-token-0123',
    fetch,
    timeoutMs: 5000,
  });

  const worker = createAtcWorker({
    client,
    trustedFolders: { box: ['/tmp/boxxy-test/repos'], laptop: ['/tmp/boxxy-test/repos'] },
  });

  return {
    clock,
    atc,
    worker,
    buildSpawnRequest: (attempt: AttemptId, target: string) => ({
      target,
      cwd: '/tmp/boxxy-test/repos/widget',
      prompt: 'Build the widget.',
      agent: 'claude',
      model: 'example-model',
      effort: 'medium' as const,
      name: `boxxy/${attempt}` as const,
      idempotencyKey: attempt,
    }),
  };
}

test.each(workerContract)(
  'it keeps the worker contract on a suspending target: %s',
  async (_title, check) => {
    const ctx = setupTest();

    const outcome = await check({
      worker: ctx.worker,
      buildSpawnRequest: (attempt) => ctx.buildSpawnRequest(attempt, 'box'),
    });

    expect(outcome.received).toStrictEqual(outcome.expected);
  },
);

test.each(workerContract)(
  'it keeps the worker contract on a local target: %s',
  async (_title, check) => {
    const ctx = setupTest();

    const outcome = await check({
      worker: ctx.worker,
      buildSpawnRequest: (attempt) => ctx.buildSpawnRequest(attempt, 'laptop'),
    });

    expect(outcome.received).toStrictEqual(outcome.expected);
  },
);

test('#start answers the session with the caller that atc reports for it', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'started',
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
    agentSession: brandSchemas.agentSessionId.parse('agent-1'),
    caller: { issuer: 'https://broker.test', subject: 'imp-id-s1-fake' },
  });
});

test('#start sends the token variable of a git source as an env credentialRef', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;
  const { cwd: _folder, ...request } = ctx.buildSpawnRequest(attempt, 'box');

  await ctx.worker.start({
    ...request,
    source: {
      url: 'https://git.example.test/example/widget.git',
      ref: 'main',
      credentialRef: { name: 'EXAMPLE_GIT_TOKEN' },
    },
  });

  expect(ctx.atc.calls).toStrictEqual([
    {
      tool: 'atc_session_spawn',
      args: expect.objectContaining({
        workspace: {
          kind: 'git',
          url: 'https://git.example.test/example/widget.git',
          ref: 'main',
          credentialRef: { kind: 'env', name: 'EXAMPLE_GIT_TOKEN' },
        },
      }),
    },
  ]);
});

test('#start spawns a git source as a trusted atc workspace with no folder', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;
  const { cwd: _folder, ...request } = ctx.buildSpawnRequest(attempt, 'box');

  const outcome = await ctx.worker.start({
    ...request,
    source: { url: 'https://git.example.test/example/widget.git', ref: 'main' },
  });

  expect([outcome.kind, ctx.atc.calls]).toStrictEqual([
    'started',
    [
      {
        tool: 'atc_session_spawn',
        args: {
          target: 'box',
          workspace: {
            kind: 'git',
            url: 'https://git.example.test/example/widget.git',
            ref: 'main',
          },
          trustClonedWorkspace: true,
          name: `boxxy/${attempt}`,
          prompt: 'Build the widget.',
          agent: 'claude',
          model: 'example-model',
          effort: 'medium',
          idempotencyKey: attempt,
        },
      },
    ],
  ]);
});

test('#start refuses a folder outside the target trusted folders and spawns nothing', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  const outcome = await ctx.worker.start({
    ...ctx.buildSpawnRequest(attempt, 'box'),
    cwd: '/tmp/boxxy-test/repos-old/widget',
  });

  expect([outcome, ctx.atc.calls]).toStrictEqual([
    { kind: 'refused', cause: 'other', reason: 'worker folder not trusted' },
    [],
  ]);
});

test('#start answers capacity when the host has no RAM budget for another machine', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', {
    kind: 'refusal',
    code: 'host_unavailable',
    problem: 'ram_budget_exceeded',
  });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    cause: 'capacity',
    reason: 'host_unavailable (ram_budget_exceeded): the fake atc refused the call',
  });
});

test('#start answers the cause other for a host atc cannot ready for another problem', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', {
    kind: 'refusal',
    code: 'host_unavailable',
    problem: 'impd_outdated',
  });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    cause: 'other',
    reason: 'host_unavailable (impd_outdated): the fake atc refused the call',
  });
});

test('#start answers refused when atc answers a spawn with a result that fails its schema', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', {
    kind: 'malformed',
    result: { id: 's1-fake', host: { issuer: 'https://elsewhere.test' } },
  });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    cause: 'other',
    reason: expect.stringContaining('malformed_answer'),
  });
});

test('#start answers unknown when atc cannot tell whether the spawn ran', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', { kind: 'refusal', code: 'outcome_unknown' });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'unknown',
    reason: expect.stringContaining('outcome_unknown'),
  });
});

test('#start answers unknown when the call fails with no atc answer', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', { kind: 'no-answer' });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'atc gave no answer: HTTP 502' });
});

test('#start answers unknown for a keyed spawn that ran before its session is listed again', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', { kind: 'refusal', code: 'no_such_session' });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toMatchObject({ kind: 'unknown' });
});

test('#start answers refused with the cause other for any other atc refusal', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('atc_session_spawn', { kind: 'refusal', code: 'auth_signin_needed' });

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    cause: 'other',
    reason: 'auth_signin_needed: the fake atc refused the call',
  });
});

test('#stop answers absent for an attempt whose session never appeared', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ atcSession: null });

  const outcome = await ctx.worker.stop(attempt);

  expect(outcome).toStrictEqual({ kind: 'absent' });
});

test('#stop answers unknown when the call fails with no atc answer', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ atcSession: brandSchemas.atcSessionId.parse('s1-fake') });

  ctx.atc.failNext('atc_session_stop', { kind: 'no-answer' });

  const outcome = await ctx.worker.stop(attempt);

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'atc gave no answer: HTTP 502' });
});

test('#forget answers unknown when the call fails with no atc answer', async () => {
  const ctx = setupTest();

  ctx.atc.failNext('atc_session_forget', { kind: 'no-answer' });

  const outcome = await ctx.worker.forget(brandSchemas.atcSessionId.parse('s1-fake'));

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'atc gave no answer: HTTP 502' });
});

test('#reconcile finds a session by its spawn name when the attempt holds no session', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ atcSession: null });

  await ctx.worker.start(ctx.buildSpawnRequest(attempt.id, 'box'));

  const reading = await ctx.worker.reconcile(attempt);

  expect(reading).toMatchObject({ kind: 'running', atcSession: 's1-fake' });
});

test('#reconcile throws when atc does not answer, so no session reads absent by mistake', () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ atcSession: brandSchemas.atcSessionId.parse('s1-fake') });

  ctx.atc.failNext('atc_session_get', { kind: 'no-answer' });

  expect(ctx.worker.reconcile(attempt)).rejects.toThrow('atc gave no answer');
});

test('#suspend answers refused when another owner keeps the host awake', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  ctx.atc.failNext('atc_session_stop', { kind: 'refusal', code: 'host_leased' });

  const outcome = await ctx.worker.suspend(attempt, null);

  expect(outcome).toStrictEqual({
    kind: 'refused',
    reason: expect.stringContaining('host_leased'),
  });
});

test('#suspend suspends a session whose last activity is at the idle time', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  const outcome = await ctx.worker.suspend(attempt, ctx.clock.advance(60_000));

  expect(outcome).toStrictEqual({ kind: 'suspended' });
});

test('#suspend answers active when the owner attached after the idle time', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  const idleSince = ctx.clock.advance(60_000);

  ctx.atc.patchSession('s1-fake', { lastAttachedAt: ctx.clock.advance(1000) });

  const outcome = await ctx.worker.suspend(attempt, idleSince);

  expect(outcome).toStrictEqual({ kind: 'active' });
});

test('#forget refuses a session that still runs', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const outcome = await ctx.worker.forget(brandSchemas.atcSessionId.parse('s1-fake'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    reason: expect.stringContaining('session_live'),
  });
});

test('#resume answers started without an adopt when the session already runs', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  const outcome = await ctx.worker.resume(attempt);

  expect([outcome.kind, ctx.atc.calls.map((call) => call.tool)]).toStrictEqual([
    'started',
    ['atc_session_spawn', 'atc_session_get'],
  ]);
});

test('#resume answers refused when atc cannot ready the host to wake', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  await ctx.worker.stop(attempt);

  ctx.atc.failNext('atc_session_adopt', { kind: 'refusal', code: 'host_unavailable' });

  const outcome = await ctx.worker.resume(attempt);

  expect(outcome).toMatchObject({ kind: 'refused', cause: 'other' });
});

test('#resume answers capacity when the host has no RAM budget to wake', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  await ctx.worker.stop(attempt);

  ctx.atc.failNext('atc_session_adopt', {
    kind: 'refusal',
    code: 'host_unavailable',
    problem: 'ram_budget_exceeded',
  });

  const outcome = await ctx.worker.resume(attempt);

  expect(outcome).toMatchObject({ kind: 'refused', cause: 'capacity' });
});

test('#resumeKept sends the prompt to the woken session as a message', async () => {
  const ctx = setupTest();
  const first = buildMockV1AttemptRow().id;
  const second = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(first, 'box'));

  const attempt = buildMockV1AttemptRow({
    id: first,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  await ctx.worker.stop(attempt);

  await ctx.worker.resumeKept(
    {
      atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
      target: 'box',
      attempt: first,
      keptAt: ctx.clock.now(),
      caller: null,
    },
    { ...ctx.buildSpawnRequest(second, 'box'), prompt: 'Fix the two findings.' },
  );

  expect(ctx.atc.listMessages('s1-fake')).toStrictEqual(['Fix the two findings.']);
});

test('#resumeKept stops the woken session again when atc refuses the message', async () => {
  const ctx = setupTest();
  const first = buildMockV1AttemptRow().id;
  const second = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(first, 'box'));

  const attempt = buildMockV1AttemptRow({
    id: first,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  await ctx.worker.stop(attempt);

  ctx.atc.failNext('atc_message_send', { kind: 'refusal', code: 'unsupported' });

  const outcome = await ctx.worker.resumeKept(
    {
      atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
      target: 'box',
      attempt: first,
      keptAt: ctx.clock.now(),
      caller: null,
    },
    ctx.buildSpawnRequest(second, 'box'),
  );

  const reading = await ctx.worker.reconcile(attempt);

  expect([outcome.kind, reading.kind]).toStrictEqual(['refused', 'suspended']);
});
