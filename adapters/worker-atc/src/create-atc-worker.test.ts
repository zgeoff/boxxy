import { expect, test } from 'bun:test';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { workerContract } from '@boxxy/dispatch/test-utils/worker-contract';
import type { AttemptId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { createAtcWorker } from './create-atc-worker.ts';
import { FakeAtcError, createFakeAtcClient } from './test-utils/create-fake-atc-client.ts';

function setupTest() {
  const clock = createFakeClock();
  const atc = createFakeAtcClient({ clock, targets: { box: 'suspending', laptop: 'local' } });

  const worker = createAtcWorker({
    client: atc,
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
    caller: { issuer: 'https://broker.test', subject: 's1-fake' },
  });
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

  ctx.atc.failNext(
    'spawn',
    new FakeAtcError('host_unavailable', { provider: 'imp', problem: 'ram_budget_exceeded' }),
  );

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    cause: 'capacity',
    reason: expect.stringContaining('host_unavailable'),
  });
});

test('#start answers unknown when atc cannot tell whether the spawn ran', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('spawn', new FakeAtcError('outcome_unknown'));

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'unknown',
    reason: expect.stringContaining('outcome_unknown'),
  });
});

test('#start answers unknown when the call fails with no atc answer', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('spawn', new Error('socket closed'));

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'socket closed' });
});

test('#start answers unknown for a keyed spawn that ran before its session is listed again', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('spawn', new FakeAtcError('no_such_session', { effectRef: 's9-fake' }));

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toMatchObject({ kind: 'unknown' });
});

test('#start answers refused with the cause other for any other atc refusal', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;

  ctx.atc.failNext('spawn', new FakeAtcError('auth_signin_needed'));

  const outcome = await ctx.worker.start(ctx.buildSpawnRequest(attempt, 'box'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    cause: 'other',
    reason: expect.stringContaining('auth_signin_needed'),
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

  ctx.atc.failNext('kill', new Error('socket closed'));

  const outcome = await ctx.worker.stop(attempt);

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'socket closed' });
});

test('#forget answers unknown when the call fails with no atc answer', async () => {
  const ctx = setupTest();

  ctx.atc.failNext('forget', new Error('socket closed'));

  const outcome = await ctx.worker.forget(brandSchemas.atcSessionId.parse('s1-fake'));

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'socket closed' });
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

  ctx.atc.failNext('get', new Error('socket closed'));

  expect(ctx.worker.reconcile(attempt)).rejects.toThrow('socket closed');
});

test('#suspend answers refused when another owner keeps the host awake', async () => {
  const ctx = setupTest();
  const id = buildMockV1AttemptRow().id;

  await ctx.worker.start(ctx.buildSpawnRequest(id, 'box'));

  const attempt = buildMockV1AttemptRow({
    id,
    atcSession: brandSchemas.atcSessionId.parse('s1-fake'),
  });

  ctx.atc.failNext('kill', new FakeAtcError('host_leased'));

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

  expect([outcome.kind, ctx.atc.calls.map((call) => call.call)]).toStrictEqual([
    'started',
    ['spawn', 'get'],
  ]);
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

  ctx.atc.failNext(
    'adopt',
    new FakeAtcError('host_unavailable', { provider: 'imp', problem: 'ram_budget_exceeded' }),
  );

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

  ctx.atc.failNext('message', new FakeAtcError('unsupported'));

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
