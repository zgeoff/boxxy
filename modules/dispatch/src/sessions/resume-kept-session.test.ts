import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadVerifyRules } from '../test-utils/load-verify-rules.ts';
import { forgetSessions } from './forget-sessions.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const claimAttempt = async (): Promise<AttemptRow> => {
    const claim = await dispatch.claim();

    invariant(claim !== null, 'the claim picks the seeded item');

    return dispatch.readAttempt(claim.attempt.id);
  };

  return {
    ...dispatch,
    claimAttempt,
    listStarted: async () => {
      const facts = await dispatch.listFacts('boxxy.attempt.started');

      return facts.map((fact) => fact.payload);
    },
    listKept: () => dispatch.store.read((tx) => tx.listKeptSessions()),
    listCalls: (method: string) =>
      dispatch.worker.calls.filter((call) => call.method === method).map((call) => call.subject),

    // the item's review claims, passes and settles
    passReview: async () => {
      const review = await claimAttempt();

      await dispatch.closeAndSettle(review, {
        round: 1,
        cause: 'first',
        reading: buildMockGateReading({ status: 'passed' }),
        unrelatedLines: null,
      });
    },
    forgetSessions: () =>
      forgetSessions({
        store: dispatch.store,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        actor: `boxxy:runner:${dispatch.runner}`,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
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

test('it wakes the build session for a builder verify, which then runs on it', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: true }));

  const build = await ctx.seedBuild();

  await ctx.passReview();

  const verify = await ctx.claimAttempt();

  const received: unknown = [ctx.listCalls('resumeKept'), verify.atcSession, verify.state];

  expect(received).toStrictEqual([[verify.id], build.atcSession, 'running']);
});

test('it starts a fresh verify on a new session and leaves the build session kept', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'fresh', resume: true }));

  const build = await ctx.seedBuild();

  await ctx.passReview();

  const verify = await ctx.claimAttempt();
  const kept = await ctx.listKept();

  const received: unknown = [
    ctx.listCalls('resumeKept'),
    ctx.listCalls('start').includes(verify.id),
    kept.map((entry) => entry.kept.attempt),
  ];

  expect(received).toStrictEqual([[], true, [build.id]]);
});

test('it starts a builder verify fresh, and says so in the started fact, when the build session is gone', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: true }));

  await ctx.seedBuild();
  await ctx.passReview();

  ctx.clock.advance(25 * 3_600_000);

  await ctx.forgetSessions();

  const verify = await ctx.claimAttempt();
  const started = await ctx.listStarted();

  const received: unknown = [ctx.listCalls('start').includes(verify.id), started.at(-1)];

  expect(received).toStrictEqual([
    true,
    expect.objectContaining({ attempt: verify.id, resumeFallback: true }),
  ]);
});

test('it wakes the session of a builder verify that failed for the rework build', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: true }));

  const build = await ctx.seedBuild();

  await ctx.passReview();

  const verify = await ctx.claimAttempt();

  await ctx.closeAndSettle(verify, {
    result: { kind: 'failed', features: ['upload-retry'] },
    friction: [],
  });

  const rework = await ctx.claimAttempt();

  const received: unknown = [rework.phase, ctx.listCalls('resumeKept').at(-1), rework.atcSession];

  expect(received).toStrictEqual([
    brandSchemas.phaseName.parse('build'),
    rework.id,
    build.atcSession,
  ]);
});
