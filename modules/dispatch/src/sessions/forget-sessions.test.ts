import { expect, test } from 'bun:test';
import type { AttemptRow, WorkerKind } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { forgetSessions } from './forget-sessions.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    hourMs: 3_600_000,
    getSession: (attempt: AttemptRow) => {
      invariant(attempt.atcSession !== null, 'the attempt ran in a session');

      return attempt.atcSession;
    },
    forget: () =>
      forgetSessions({
        store: dispatch.store,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        actor: `boxxy:runner:${dispatch.runner}`,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    forgetWith: (worker: WorkerKind) =>
      forgetSessions({
        store: dispatch.store,
        worker,
        rules: dispatch.rules(),
        actor: `boxxy:runner:${dispatch.runner}`,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    listKept: () => dispatch.store.read((tx) => tx.listKeptSessions()),
    listForgetCalls: () => dispatch.worker.calls.filter((call) => call.method === 'forget'),
    failAttempt: async (attempt: AttemptRow) => {
      await settleAttempt({
        store: dispatch.store,
        attempt: attempt.id,
        forced: 'stalled',
        sessionStopped: true,
        rules: dispatch.rules(),
        actor: 'boxxy:runner:runner-1',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });
    },
    failBuild: async () => {
      await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

      const claim = await dispatch.claim();

      invariant(claim !== null, 'the claim picks the seeded item');

      await settleAttempt({
        store: dispatch.store,
        attempt: claim.attempt.id,
        forced: 'stalled',
        sessionStopped: true,
        rules: dispatch.rules(),
        actor: 'boxxy:runner:runner-1',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });

      return dispatch.readAttempt(claim.attempt.id);
    },
    failReview: async () => {
      await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('review') });

      const claim = await dispatch.claim();

      invariant(claim !== null, 'the claim picks the seeded item');

      await settleAttempt({
        store: dispatch.store,
        attempt: claim.attempt.id,
        forced: 'stalled',
        sessionStopped: true,
        rules: dispatch.rules(),
        actor: 'boxxy:runner:runner-1',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });

      return dispatch.readAttempt(claim.attempt.id);
    },
    strayBuild: async () => {
      await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

      const claim = await dispatch.claim();

      invariant(claim !== null, 'the claim picks the seeded item');

      await settleAttempt({
        store: dispatch.store,
        attempt: claim.attempt.id,
        forced: 'stalled',
        sessionStopped: false,
        rules: dispatch.rules(),
        actor: 'boxxy:runner:runner-1',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });

      return dispatch.readAttempt(claim.attempt.id);
    },

    // an item closed while its spawn got no answer, so the attempt settled as a stray with no session
    strayWithoutSession: async () => {
      await dispatch.seedItem({});

      dispatch.worker.failNext('start', { kind: 'unknown', reason: 'the spawn did not answer' });

      const claim = await dispatch.claim();

      invariant(claim?.kind === 'start', 'the claim starts the seeded item');

      await dispatch.closeItem(claim.attempt.item, 'Withdrawn.');

      dispatch.clock.advance(10 * 60_000 + 1);

      await dispatch.tick();

      return { attempt: await dispatch.readAttempt(claim.attempt.id), spawn: claim.spawn };
    },
    listStrays: () =>
      dispatch.store.read((tx) =>
        tx.listStrayAttempts(brandSchemas.instant.parse(dispatch.clock.now() - 24 * 3_600_000)),
      ),
  };
}

test('it forgets the session of a succeeded attempt at once and records the forget on the row', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});
  const attempts = await ctx.store.read((tx) => tx.listItemAttempts(rework.first.item));

  const review = attempts.find((attempt) => attempt.phase === 'review');

  invariant(review !== undefined, 'the rework ran a review');

  const report = await ctx.forget();
  const after = await ctx.readAttempt(review.id);

  expect([report.forgotten, after.sessionForgottenAt]).toStrictEqual([
    [ctx.getSession(review)],
    ctx.clock.now(),
  ]);
});

test('it keeps the kept session of the first build while its item is open and recent', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  await ctx.forget();

  const forgotten = ctx.listForgetCalls().map((call) => call.subject);

  const kept = await ctx.listKept();

  expect([forgotten.includes(ctx.getSession(rework.first)), kept.length]).toStrictEqual([false, 1]);
});

test('it forgets a kept session 24 hours after it was kept and clears it from the item', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  await ctx.failAttempt(rework.second);

  ctx.clock.advance(24 * ctx.hourMs);

  const report = await ctx.forget();
  const first = await ctx.readAttempt(rework.first.id);

  expect([
    report.forgotten.includes(ctx.getSession(rework.first)),
    await ctx.listKept(),
    first.sessionForgottenAt,
  ]).toStrictEqual([true, [], ctx.clock.now()]);
});

test('it leaves a kept session 23 hours and 59 minutes after it was kept', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  ctx.clock.advance(23 * ctx.hourMs + 59 * 60_000 - 5000);

  await ctx.forget();

  const forgotten = ctx.listForgetCalls().map((call) => call.subject);

  expect(forgotten).not.toContain(ctx.getSession(rework.first));
});

test('it forgets the kept session of an item that is closed', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  await ctx.failAttempt(rework.second);
  await ctx.closeItem(rework.first.item, 'No longer wanted.');

  const report = await ctx.forget();

  expect([
    report.forgotten.includes(ctx.getSession(rework.first)),
    await ctx.listKept(),
  ]).toStrictEqual([true, []]);
});

test('it keeps a failed attempt session for 24 hours and then forgets it', async () => {
  const ctx = await setupTest();
  const failed = await ctx.failBuild();

  ctx.clock.advance(24 * ctx.hourMs - 1000);

  const early = await ctx.forget();

  ctx.clock.advance(2000);

  const late = await ctx.forget();

  expect([
    early.forgotten.includes(ctx.getSession(failed)),
    late.forgotten.includes(ctx.getSession(failed)),
  ]).toStrictEqual([false, true]);
});

test('it forgets the session of a failed review on the next tick', async () => {
  const ctx = await setupTest();
  const failed = await ctx.failReview();

  ctx.clock.advance(5000);

  const report = await ctx.forget();
  const after = await ctx.readAttempt(failed.id);

  expect([failed.phase, report.forgotten, after.sessionForgottenAt]).toStrictEqual([
    brandSchemas.phaseName.parse('review'),
    [ctx.getSession(failed)],
    ctx.clock.now(),
  ]);
});

test('it tries a refused forget again on the next tick and records nothing for the refusal', async () => {
  const ctx = await setupTest();
  const failed = await ctx.failBuild();

  ctx.clock.advance(25 * ctx.hourMs);
  ctx.worker.failNext('forget', { kind: 'refused', cause: 'other', reason: 'host busy' });

  const first = await ctx.forget();
  const afterFirst = await ctx.readAttempt(failed.id);
  const second = await ctx.forget();
  const afterSecond = await ctx.readAttempt(failed.id);

  const received: unknown = [
    first.failed,
    afterFirst.sessionForgottenAt,
    second.forgotten,
    afterSecond.sessionForgottenAt,
  ];

  expect(received).toStrictEqual([
    [ctx.getSession(failed)],
    null,
    [ctx.getSession(failed)],
    ctx.clock.now(),
  ]);
});

test('it forgets a session once', async () => {
  const ctx = await setupTest();

  await ctx.failBuild();

  ctx.clock.advance(25 * ctx.hourMs);

  await ctx.forget();

  const again = await ctx.forget();

  expect(again).toStrictEqual({ forgotten: [], failed: [], unread: [] });
});

test('it stops and forgets a stray session whose stop is still unconfirmed after 24 hours', async () => {
  const ctx = await setupTest();
  const stray = await ctx.strayBuild();

  ctx.clock.advance(24 * ctx.hourMs + 1000);

  const report = await ctx.forget();
  const after = await ctx.readAttempt(stray.id);

  const received: unknown = [
    await ctx.listStrays(),
    report.forgotten,
    after.sessionStoppedAt,
    after.sessionForgottenAt,
  ];

  expect(received).toStrictEqual([[], [ctx.getSession(stray)], ctx.clock.now(), ctx.clock.now()]);
});

test('it leaves a stray session whose stop is unconfirmed until 24 hours after it strayed', async () => {
  const ctx = await setupTest();
  const stray = await ctx.strayBuild();

  ctx.clock.advance(24 * ctx.hourMs);

  const report = await ctx.forget();

  expect(report.forgotten).not.toContain(ctx.getSession(stray));
});

test('it keeps a stray session whose late stop is refused and tries again on the next tick', async () => {
  const ctx = await setupTest();
  const stray = await ctx.strayBuild();

  ctx.clock.advance(25 * ctx.hourMs);
  ctx.worker.failNext('stop', { kind: 'refused', cause: 'other', reason: 'host kept awake' });

  const first = await ctx.forget();
  const afterFirst = await ctx.readAttempt(stray.id);
  const second = await ctx.forget();

  const received: unknown = [
    first.failed,
    ctx.listForgetCalls().length,
    afterFirst.sessionStoppedAt,
    second.forgotten,
  ];

  expect(received).toStrictEqual([[ctx.getSession(stray)], 1, null, [ctx.getSession(stray)]]);
});

test('it stops and forgets the late session of a stray with none, unconfirmed after 24 hours', async () => {
  const ctx = await setupTest();
  const stray = await ctx.strayWithoutSession();
  const late = await ctx.worker.start(stray.spawn);

  invariant(late.kind === 'started', 'the late spawn lands');

  ctx.clock.advance(24 * ctx.hourMs + 1000);

  const report = await ctx.forget();
  const after = await ctx.readAttempt(stray.attempt.id);

  const received: unknown = [
    stray.attempt.atcSession,
    await ctx.listStrays(),
    report.forgotten,
    after.atcSession,
    after.sessionForgottenAt,
  ];

  expect(received).toStrictEqual([null, [], [late.atcSession], late.atcSession, ctx.clock.now()]);
});

test('it forgets the later sessions when the lookup of a stray with no session throws', async () => {
  const ctx = await setupTest();
  const sessionless = await ctx.strayWithoutSession();
  const stray = await ctx.strayBuild();

  const fault = new Error('atc gave no answer');

  const silent: WorkerKind = { ...ctx.worker, reconcile: () => Promise.reject(fault) };

  ctx.clock.advance(24 * ctx.hourMs + 1000);

  const report = await ctx.forgetWith(silent);
  const after = await ctx.readAttempt(sessionless.attempt.id);

  expect([report, after.sessionForgottenAt]).toStrictEqual([
    {
      forgotten: [ctx.getSession(stray)],
      failed: [],
      unread: [{ attempt: sessionless.attempt.id, error: fault }],
    },
    null,
  ]);
});

test('it closes the cleanup of a stray whose session never appeared in 24 hours', async () => {
  const ctx = await setupTest();
  const stray = await ctx.strayWithoutSession();

  ctx.clock.advance(24 * ctx.hourMs + 1000);

  const report = await ctx.forget();
  const after = await ctx.readAttempt(stray.attempt.id);
  const again = await ctx.forget();

  expect([report, after.sessionForgottenAt, again]).toStrictEqual([
    { forgotten: [], failed: [], unread: [] },
    ctx.clock.now(),
    { forgotten: [], failed: [], unread: [] },
  ]);
});
