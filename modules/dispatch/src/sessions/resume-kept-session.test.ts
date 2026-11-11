import { expect, test } from 'bun:test';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    listStarted: async () => {
      const facts = await dispatch.listFacts('boxxy.attempt.started');

      return facts.map((fact) => fact.payload);
    },
    listKept: () => dispatch.store.read((tx) => tx.listKeptSessions()),
  };
}

test('it records the kept session on the item when the build settles built', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});
  const [kept] = await ctx.listKept();

  const received: unknown = kept?.kept;

  expect(received).toStrictEqual({
    atcSession: rework.first.atcSession,
    target: 'worker-host',
    attempt: rework.first.id,
    keptAt: expect.any(Number),
    caller: rework.first.caller,
  });
});

test('it wakes the kept session for the rework and starts the second attempt on it', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({ startByWorker: true });

  const resumes = ctx.worker.calls.filter((call) => call.method === 'resumeKept');
  const starts = ctx.worker.calls.filter((call) => call.method === 'start');

  const received: unknown = [
    rework.second.atcSession,
    rework.second.state,
    resumes.map((call) => call.subject),
    starts.map((call) => call.subject).includes(rework.second.id),
    await ctx.listKept(),
  ];

  expect(received).toStrictEqual([
    rework.first.atcSession,
    'running',
    [rework.second.id],
    false,
    [],
  ]);
});

test('it records resumeFallback false in the started fact of a woken session', async () => {
  const ctx = await setupTest();

  await ctx.seedRework({ startByWorker: true });

  const started = await ctx.listStarted();

  expect(started.at(-1)).toMatchObject({ resumeFallback: false });
});

test('it binds the agent session of the kept session to the second attempt without a fault', async () => {
  const ctx = await setupTest();

  await ctx.seedRework({ startByWorker: true });

  const bound = await ctx.listFacts('boxxy.attempt.session_bound');

  expect(bound).toHaveLength(3);
});

test('it spawns a fresh session and says so in the started fact when the wake is refused', async () => {
  const ctx = await setupTest();

  ctx.worker.failNext('resumeKept', { kind: 'refused', cause: 'other', reason: 'no such session' });

  const rework = await ctx.seedRework({ startByWorker: true });
  const started = await ctx.listStarted();

  const received: unknown = [
    rework.second.state,
    rework.second.atcSession === rework.first.atcSession,
    started.at(-1),
    await ctx.listKept(),
  ];

  expect(received).toStrictEqual([
    'running',
    false,
    expect.objectContaining({ resumeFallback: true }),
    [],
  ]);
});

test('it starts the second attempt with a plain spawn when the wake is refused', async () => {
  const ctx = await setupTest();

  ctx.worker.failNext('resumeKept', { kind: 'refused', cause: 'other', reason: 'no such session' });

  const rework = await ctx.seedRework({ startByWorker: true });

  const starts = ctx.worker.calls.filter((call) => call.method === 'start');

  expect(starts.map((call) => call.subject)).toContain(rework.second.id);
});

test('it hands an unanswered wake to the reconcile table and keeps the kept session', async () => {
  const ctx = await setupTest();

  ctx.worker.failNext('resumeKept', { kind: 'unknown', reason: 'socket closed' });

  const rework = await ctx.seedRework({ startByWorker: true });
  const kept = await ctx.listKept();

  const received: unknown = [rework.second.state, kept.length];

  expect(received).toStrictEqual(['reconciling', 1]);
});

test('it settles a wake refused for capacity as no-capacity and holds the pool back', async () => {
  const ctx = await setupTest();

  ctx.worker.failNext('resumeKept', { kind: 'refused', cause: 'capacity', reason: 'no slot' });

  const rework = await ctx.seedRework({ startByWorker: true });

  const received: unknown = [
    rework.second.state,
    rework.second.failure,
    ctx.backoff.listHeld(ctx.clock.now()),
  ];

  expect(received).toStrictEqual(['failed', 'no-capacity', [rework.second.pool]]);
});
