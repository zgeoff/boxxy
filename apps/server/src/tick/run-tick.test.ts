import { expect, test } from 'bun:test';
import { closeOutAttempt, requestWake, settleAttempt } from '@boxxy/dispatch';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import type { AttemptId, SessionReading, WorkerKind } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import invariant from 'tiny-invariant';
import type { TickDeps } from './run-tick.ts';
import { runTick } from './run-tick.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const readings = new Map<AttemptId, SessionReading>();

  const logged: string[] = [];
  const loggedFields: Readonly<Record<string, unknown>>[] = [];

  const buildDeps = (worker: WorkerKind = dispatch.worker): TickDeps => ({
    store: dispatch.store,
    runner: dispatch.runner,
    worker,
    rules: dispatch.rules(),
    backoff: dispatch.backoff,
    spawn: dispatch.spawn,
    notifier: createFakeNotifier(),
    now: dispatch.clock.now(),
    newId: dispatch.newId,
    readings,
    log: {
      warn: (message, fields) => {
        logged.push(message);
        loggedFields.push(fields);
      },
    },
  });

  return {
    dispatch,
    readings,
    logged,
    loggedFields,
    buildDeps,
    readRunner: () => dispatch.store.read((tx) => tx.readRunner(dispatch.runner)),
  };
}

test('it writes the heartbeat of the runner', async () => {
  const ctx = await setupTest();

  await runTick(ctx.buildDeps());

  const runner = await ctx.readRunner();

  expect(runner).toStrictEqual({
    id: ctx.dispatch.runner,
    heartbeatAt: ctx.dispatch.clock.now(),
    paused: false,
  });
});

test('it claims a ready item and reads its session in the same tick', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const report = await runTick(ctx.buildDeps());

  expect(report).toStrictEqual({
    claimed: 1,
    read: 1,
    strays: 0,
    forgotten: 0,
    notices: { sent: 0, failed: 0, stuck: 0 },
  });

  const live = await ctx.dispatch.store.read((tx) => tx.listLiveAttempts());

  expect(live.map((attempt) => attempt.item)).toStrictEqual([item]);
});

test('it keeps the reading of each live attempt for the runner status', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await runTick(ctx.buildDeps());

  const live = await ctx.dispatch.store.read((tx) => tx.listLiveAttempts());

  expect([...ctx.readings.keys()]).toStrictEqual(live.map((attempt) => attempt.id));
});

test('it goes on to the next attempt when the reading of one throws', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await runTick(ctx.buildDeps());

  const [first] = await ctx.dispatch.store.read((tx) => tx.listLiveAttempts());

  const worker: WorkerKind = {
    ...ctx.dispatch.worker,
    reconcile: (attempt) =>
      attempt.id === first?.id
        ? Promise.reject(new Error('the host did not answer'))
        : ctx.dispatch.worker.reconcile(attempt),
  };

  const report = await runTick(ctx.buildDeps(worker));

  expect({ read: report.read, logged: ctx.logged }).toStrictEqual({
    read: 1,
    logged: ['the reading of an attempt failed'],
  });
});

test('it ends the claim loop on an error and still reads the live attempts', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await runTick(ctx.buildDeps());

  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const worker: WorkerKind = {
    ...ctx.dispatch.worker,
    start: () => Promise.reject(new Error('the host did not answer')),
  };

  const report = await runTick(ctx.buildDeps(worker));

  expect({ claimed: report.claimed, read: report.read, first: ctx.logged[0] }).toStrictEqual({
    claimed: 0,
    read: 2,
    first: 'the claim loop ended',
  });
});

test('it logs a spawn that the worker refused, with its attempt, item and reason', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  ctx.dispatch.worker.failNext('start', {
    kind: 'refused',
    cause: 'capacity',
    reason: 'host_unavailable: no free slot',
  });

  await runTick(ctx.buildDeps());

  const [refused] = await ctx.dispatch.store.read((tx) => tx.listItemAttempts(item));

  invariant(refused !== undefined, 'the tick claimed the seeded item');

  expect([ctx.logged, ctx.loggedFields]).toStrictEqual([
    ['the worker refused a spawn'],
    [
      {
        attempt: refused.id,
        item,
        cause: 'capacity',
        reason: 'host_unavailable: no free slot',
      },
    ],
  ]);
});

test('it logs a wake that the worker refused, with its attempt, item and reason', async () => {
  const ctx = await setupTest();

  const item = await ctx.dispatch.seedItem({
    phase: brandSchemas.phaseName.parse('design'),
    designMode: 'attended',
  });

  await runTick(ctx.buildDeps());

  const [attempt] = await ctx.dispatch.store.read((tx) => tx.listItemAttempts(item));

  invariant(attempt !== undefined, 'the tick claimed the seeded item');

  ctx.dispatch.worker.setSession(attempt.id, { state: 'suspended', asked: true });

  await runTick(ctx.buildDeps());

  await requestWake({
    store: ctx.dispatch.store,
    attempt: attempt.id,
    by: 'command',
    actor: 'boxxy:owner:local',
    now: ctx.dispatch.clock.now(),
    newId: ctx.dispatch.newId,
  });

  ctx.dispatch.worker.failNext('resume', {
    kind: 'refused',
    cause: 'capacity',
    reason: 'host_unavailable (ram_budget_exceeded): no free slot',
  });

  const before = ctx.logged.length;

  await runTick(ctx.buildDeps());

  expect([ctx.logged.slice(before), ctx.loggedFields.slice(before)]).toStrictEqual([
    ['the worker refused a wake'],
    [
      {
        attempt: attempt.id,
        item,
        cause: 'capacity',
        reason: 'host_unavailable (ram_budget_exceeded): no free slot',
      },
    ],
  ]);
});

test('it logs each inner error of an AggregateError that ends the claim loop', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const failure = new AggregateError(
    [new Error('disk I/O error'), new Error('cannot rollback - no transaction is active')],
    'the work failed, and so did its rollback',
  );

  const worker: WorkerKind = { ...ctx.dispatch.worker, start: () => Promise.reject(failure) };

  await runTick(ctx.buildDeps(worker));

  expect(ctx.loggedFields[0]).toStrictEqual({
    error:
      'AggregateError: the work failed, and so did its rollback [Error: disk I/O error] ' +
      '[Error: cannot rollback - no transaction is active]',
  });
});

test('it sends the stop of a stray session again and records it once the session stops', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({
    phase: brandSchemas.phaseName.parse('design'),
    designMode: 'attended',
  });

  const claim = await ctx.dispatch.claim();

  invariant(claim !== null, 'the claim picks the seeded item');

  const attempt = await ctx.dispatch.readAttempt(claim.attempt.id);

  await closeOutAttempt({
    store: ctx.dispatch.store,
    call: ctx.dispatch.buildCallRef(attempt),
    body: {
      result: { kind: 'designed', design: { summary: 'Follow the theme.', location: null } },
      friction: [],
    },
    rules: ctx.dispatch.rules(),
    now: ctx.dispatch.clock.now(),
    newId: ctx.dispatch.newId,
  });

  ctx.dispatch.worker.failAlways('stop', { kind: 'unknown', reason: 'host_leased' });
  ctx.dispatch.clock.advance(10 * 60_000 + 1);

  await ctx.dispatch.tick();

  const stopping: WorkerKind = {
    ...ctx.dispatch.worker,
    stop: () => Promise.resolve({ kind: 'stopped' }),
  };

  const report = await runTick(ctx.buildDeps(stopping));
  const after = await ctx.dispatch.readAttempt(attempt.id);

  expect(report.strays).toBe(1);
  expect(after.sessionStoppedAt).toBe(ctx.dispatch.clock.now());
});

test('it logs each session whose forget the worker refused', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const claim = await ctx.dispatch.claim();

  invariant(claim !== null, 'the claim picks the seeded item');

  await settleAttempt({
    store: ctx.dispatch.store,
    attempt: claim.attempt.id,
    forced: 'stalled',
    sessionStopped: true,
    rules: ctx.dispatch.rules(),
    actor: `boxxy:runner:${ctx.dispatch.runner}`,
    now: ctx.dispatch.clock.now(),
    newId: ctx.dispatch.newId,
  });

  const failed = await ctx.dispatch.readAttempt(claim.attempt.id);

  ctx.dispatch.clock.advance(25 * 3_600_000);
  ctx.dispatch.worker.failNext('forget', { kind: 'refused', cause: 'other', reason: 'host busy' });

  await runTick(ctx.buildDeps());

  expect([ctx.logged, ctx.loggedFields]).toStrictEqual([
    ['the worker did not confirm the forget of done sessions'],
    [{ sessions: [failed.atcSession] }],
  ]);
});
