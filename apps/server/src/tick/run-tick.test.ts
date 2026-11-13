import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeOutAttempt, createMergeJob, requestWake, settleAttempt } from '@boxxy/dispatch';
import type { FakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import { createFakeForge } from '@boxxy/dispatch/test-utils/create-fake-forge';
import { createFakeJob } from '@boxxy/dispatch/test-utils/create-fake-job';
import { createFakeVerifier } from '@boxxy/dispatch/test-utils/create-fake-verifier';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { loadJobRules } from '@boxxy/dispatch/test-utils/load-job-rules';
import type {
  AttemptId,
  ClaimStore,
  CommitSha,
  ItemId,
  SessionReading,
  WorkerKind,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { buildMockMergeAction } from '@boxxy/model/test-utils/build-mock-merge-action';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import invariant from 'tiny-invariant';
import type { TickDeps } from './run-tick.ts';
import { runTick } from './run-tick.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-tick-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const file = path.join(folder, 'boxxy.db');

  const store = await createSQLiteClaimStore(file);

  onTestFinished(() => store.close());

  // a second runner's handle on the same store file, as a second server opens it
  const secondStore = await createSQLiteClaimStore(file);

  onTestFinished(() => secondStore.close());

  // the runner's next write waits for this hook, as a write that loses the race for the lock does
  const gate: { beforeNextWrite: (() => Promise<unknown>) | null } = { beforeNextWrite: null };

  const gatedStore: ClaimStore = {
    read: store.read,
    exclusive: async (work) => {
      const hook = gate.beforeNextWrite;

      gate.beforeNextWrite = null;

      await hook?.();

      return store.exclusive(work);
    },
  };

  const dispatch = await createTestDispatch({ store });

  const readings = new Map<AttemptId, SessionReading>();

  const logged: string[] = [];
  const loggedFields: Readonly<Record<string, unknown>>[] = [];

  const buildDeps = (worker: WorkerKind = dispatch.worker): TickDeps => ({
    store: gatedStore,
    runner: dispatch.runner,
    workers: new Map([
      [brandSchemas.workerKindName.parse('atc.session'), { shape: 'session', worker }],
    ]),
    rules: dispatch.rules(),
    backoff: dispatch.backoff,
    spawn: dispatch.spawn,
    notifier: createFakeNotifier(),
    now: dispatch.clock.now(),
    newId: dispatch.newId,
    readings,
    noticeStatus: { lastError: null },
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
    buildSecondRunnerDeps: (): TickDeps => ({
      ...buildDeps(),
      store: secondStore,
      runner: brandSchemas.runnerId.parse('runner-2'),
      readings: new Map(),
    }),
    holdNextWrite: (hook: () => Promise<unknown>) => {
      gate.beforeNextWrite = hook;
    },
    readRunner: () => dispatch.store.read((tx) => tx.readRunner(dispatch.runner)),

    // the example rules with a merge step on `merge.forge`, with their limits synced
    useJobRules: async () => {
      const rules = loadJobRules();

      dispatch.setRules(rules);

      await dispatch.store.exclusive((tx) => tx.syncLimits(rules.limits, dispatch.clock.now()));
    },

    // a tick whose merges run on the merge job, reading this forge
    tickMerge: (forge: FakeForge) => {
      const deps = buildDeps();
      const job = createMergeJob({ forge, verifier: createFakeVerifier(), store: dispatch.store });

      return runTick({
        ...deps,
        workers: new Map([
          ...deps.workers,
          [brandSchemas.workerKindName.parse('merge.forge'), { shape: 'job', worker: job }],
        ]),
      });
    },

    // the item's review passes at the head, so the next tick claims its merge
    passReview: async (head: CommitSha) => {
      const review = await dispatch.claim();

      invariant(review?.attempt.phase === 'review', 'the review claims');

      const row = await dispatch.readAttempt(review.attempt.id);

      await dispatch.closeAndSettle(row, {
        round: 1,
        cause: 'first',
        reading: buildMockGateReading({ status: 'passed', head }),
        unrelatedLines: null,
      });
    },
    readMerge: async (item: ItemId) => {
      const attempts = await dispatch.store.read((tx) => tx.listItemAttempts(item));

      const view = await dispatch.store.read((tx) =>
        tx.readItem(item, dispatch.clock.now(), dispatch.rules()),
      );

      return { attempt: attempts.find((attempt) => attempt.phase === 'merge'), view };
    },
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
    notices: { sent: 0, failed: 0, lastError: null },
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

test('it starts an item once in a tick when the worker refuses its spawn for a cause other than capacity', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  ctx.dispatch.worker.failAlways('start', {
    kind: 'refused',
    cause: 'other',
    reason: 'the host refused the spawn',
  });

  await runTick(ctx.buildDeps());

  const starts = ctx.dispatch.worker.calls.filter((call) => call.method === 'start');

  const view = await ctx.dispatch.store.read((tx) =>
    tx.readItem(item, ctx.dispatch.clock.now(), ctx.dispatch.rules()),
  );

  const position: unknown = view?.position;

  expect(starts).toBeArrayOfSize(1);

  expect(position).toStrictEqual({
    kind: 'phase',
    phase: 'build',
    round: expect.any(Number),
  });
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

test('it claims a merge with no session start and reads it through its job worker', async () => {
  const ctx = await setupTest();

  const job = createFakeJob();
  const rules = loadJobRules(job.drive);

  await ctx.dispatch.store.exclusive((tx) => tx.syncLimits(rules.limits, ctx.dispatch.clock.now()));

  const item = await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('merge') });

  const deps = ctx.buildDeps();

  const report = await runTick({
    ...deps,
    rules,
    workers: new Map([
      ...deps.workers,
      [brandSchemas.workerKindName.parse('merge.forge'), { shape: 'job', worker: job.worker }],
    ]),
  });

  const [attempt] = await ctx.dispatch.store.read((tx) => tx.listItemAttempts(item));

  const seen: unknown = {
    claimed: report.claimed,
    state: attempt?.state,
    calls: ctx.dispatch.worker.calls,
    reads: job.reads.map((read) => read.id),
  };

  expect(seen).toStrictEqual({ claimed: 1, state: 'running', calls: [], reads: [attempt?.id] });
});

test('it sends one merge call when a second runner ticks between the first runner’s job read and mark', async () => {
  const ctx = await setupTest();

  const job = createFakeJob();
  const rules = loadJobRules(job.drive);

  await ctx.dispatch.store.exclusive((tx) => tx.syncLimits(rules.limits, ctx.dispatch.clock.now()));
  await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('merge') });

  const withJob = (deps: TickDeps): TickDeps => ({
    ...deps,
    rules,
    workers: new Map([
      ...deps.workers,
      [brandSchemas.workerKindName.parse('merge.forge'), { shape: 'job', worker: job.worker }],
    ]),
  });

  await runTick(withJob(ctx.buildDeps()));

  ctx.dispatch.clock.advance(30_000);
  job.setStep({ kind: 'act', action: buildMockMergeAction() });

  job.beforeNextRead(() => {
    ctx.holdNextWrite(() => runTick(withJob(ctx.buildSecondRunnerDeps())));

    return Promise.resolve();
  });

  await runTick(withJob(ctx.buildDeps()));

  const requested = await ctx.dispatch.listFacts('boxxy.merge.requested');

  expect([job.acts.length, requested.length]).toStrictEqual([1, 1]);
});

test('it holds a merge whose item has no pull request, with the reason in its close-out', async () => {
  const ctx = await setupTest();

  const forge = createFakeForge();

  await ctx.useJobRules();

  const item = await ctx.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('merge') });

  await ctx.tickMerge(forge);

  ctx.dispatch.clock.advance(30_000);

  await ctx.tickMerge(forge);

  const merge = await ctx.readMerge(item);

  const seen: unknown = {
    state: merge.attempt?.state,
    closeOut: merge.attempt?.closeOut,
    item: merge.view?.derived,
  };

  expect(seen).toStrictEqual({
    state: 'failed',
    closeOut: expect.objectContaining({
      outcome: 'blocked',
      reason: 'the item has no pull request',
    }),
    item: { state: 'waiting', reason: 'merge-blocked' },
  });
});

test('it holds a merge whose pull request the forge does not hold, with the reason in its close-out', async () => {
  const ctx = await setupTest();

  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.useJobRules();

  const build = await ctx.dispatch.seedBuildWithPullRequest(createFakeForge(), 7);

  await ctx.passReview(head);

  const emptyForge = createFakeForge();

  await ctx.tickMerge(emptyForge);

  ctx.dispatch.clock.advance(30_000);

  await ctx.tickMerge(emptyForge);

  const merge = await ctx.readMerge(build.item);

  const seen: unknown = {
    state: merge.attempt?.state,
    closeOut: merge.attempt?.closeOut,
    item: merge.view?.derived,
  };

  expect(seen).toStrictEqual({
    state: 'failed',
    closeOut: expect.objectContaining({
      outcome: 'blocked',
      reason: 'the forge holds no pull request example/app#7',
    }),
    item: { state: 'waiting', reason: 'merge-blocked' },
  });
});

test('it holds a merge whose pull request has no commit, with the reason in its close-out', async () => {
  const ctx = await setupTest();

  const forge = createFakeForge();
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.useJobRules();

  const build = await ctx.dispatch.seedBuildWithPullRequest(forge, 7);

  await ctx.passReview(head);
  await ctx.tickMerge(forge);

  ctx.dispatch.clock.advance(30_000);

  await ctx.tickMerge(forge);

  const merge = await ctx.readMerge(build.item);

  const seen: unknown = {
    state: merge.attempt?.state,
    closeOut: merge.attempt?.closeOut,
    item: merge.view?.derived,
  };

  expect(seen).toStrictEqual({
    state: 'failed',
    closeOut: expect.objectContaining({
      outcome: 'blocked',
      reason: 'the pull request example/app#7 has no commit',
    }),
    item: { state: 'waiting', reason: 'merge-blocked' },
  });
});

test('it reads a merge again on the next tick when the forge does not answer', async () => {
  const ctx = await setupTest();

  const forge = createFakeForge();
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.useJobRules();

  const build = await ctx.dispatch.seedBuildWithPullRequest(forge, 7);

  await ctx.passReview(head);

  forge.setDown(true);

  await ctx.tickMerge(forge);

  ctx.dispatch.clock.advance(30_000);

  await ctx.tickMerge(forge);

  const merge = await ctx.readMerge(build.item);

  const seen: unknown = {
    state: merge.attempt?.state,
    item: merge.view?.derived,
    logged: ctx.logged,
  };

  expect(seen).toStrictEqual({
    state: 'starting',
    item: { state: 'running' },
    logged: ['the reading of an attempt failed', 'the reading of an attempt failed'],
  });
});
