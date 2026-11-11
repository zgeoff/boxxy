import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { ClaimStore, FactId, Instant } from '@boxxy/model';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import invariant from 'tiny-invariant';
import { buildMockFileItemChange } from '../test-utils/build-mock-file-item-change.ts';
import { createFakeFactSink } from '../test-utils/create-fake-fact-sink.ts';
import { createMemoryClaimStore } from '../test-utils/create-memory-claim-store.ts';
import { buildInitialSenderState } from './build-initial-sender-state.ts';
import { buildOutboxStatus } from './build-outbox-status.ts';
import { outboxLimits } from './constants.ts';
import { runSenderOnce } from './run-sender-once.ts';
import type { SenderState, SenderStep } from './types.ts';

function setupTest() {
  const start = 1_800_000_000_000;
  const memory = createMemoryClaimStore();
  const parks: { ids: readonly FactId[]; reason: string }[] = [];
  const sink = createFakeFactSink();
  let now = start;

  // passes every call to the memory store and records each park mark
  const store: ClaimStore = {
    read: (work) => memory.read(work),
    exclusive: (work) =>
      memory.exclusive((tx) =>
        work({
          ...tx,
          parkFacts: (ids, reason, at) => {
            parks.push({ ids, reason });

            return tx.parkFacts(ids, reason, at);
          },
        }),
      ),
  };

  const deps = {
    store,
    sink,
    limits: outboxLimits,
    clock: { now: () => brandSchemas.instant.parse(now) },

    // no jitter
    random: () => 0.5,
  };

  const fileItems = async (count: number, outcome = 'done') => {
    await store.exclusive(async (tx) => {
      for (let index = 0; index < count; index += 1) {
        const filedAt = brandSchemas.instant.parse(start + index);
        const item = buildMockV1ItemRow({ outcome, filedAt });

        await tx.applyChange(buildMockFileItemChange(item));
      }
    });
  };

  const readUnsent = () => store.read((tx) => tx.readUnsentFacts(1000));

  return {
    ...deps,
    start,
    parks,
    fileItems,
    readUnsent,
    setNow: (value: number) => {
      now = value;
    },
    readCounts: () => store.read((tx) => tx.readOutboxCounts()),
    runTurns: async (limit: number, state: SenderState = buildInitialSenderState()) => {
      const steps: SenderStep[] = [];
      let current = state;

      for (let turn = 0; turn < limit; turn += 1) {
        const result = await runSenderOnce(deps, current);

        steps.push(result.step);

        current = result.state;

        if (result.step === 'idle' || result.step === 'blocked' || result.step === 'retry') {
          break;
        }
      }

      return { steps, state: current };
    },
  };
}

test('it sends nothing and reports idle when no row is unsent', async () => {
  const ctx = setupTest();

  const turn = await runSenderOnce(ctx, buildInitialSenderState());

  expect(turn.step).toBe('idle');
  expect(ctx.sink.sends).toStrictEqual([]);
});

test('it marks the batch sent on stored, and the next turn finds nothing', async () => {
  const ctx = setupTest();

  await ctx.fileItems(3);

  const first = await runSenderOnce(ctx, buildInitialSenderState());
  const second = await runSenderOnce(ctx, first.state);
  const unsent = await ctx.readUnsent();

  const lastStoredAt: unknown = first.state.lastStoredAt;

  expect([first.step, second.step]).toStrictEqual(['stored', 'idle']);
  expect(unsent).toStrictEqual([]);
  expect(ctx.sink.facts.size).toBe(3);
  expect(lastStoredAt).toBe(ctx.start);
});

test('it sends the rows in order', async () => {
  const ctx = setupTest();

  await ctx.fileItems(3);

  const rows = await ctx.readUnsent();

  await runSenderOnce(ctx, buildInitialSenderState());

  expect(ctx.sink.sends).toStrictEqual([rows.map((row) => row.factId)]);
});

test('it keeps the batch on retry, backs off and sends the same rows again', async () => {
  const ctx = setupTest();

  await ctx.fileItems(3);

  ctx.sink.answerNext({ kind: 'retry', reason: 'connection refused' }, { kind: 'stored' });

  const first = await runSenderOnce(ctx, buildInitialSenderState());
  const unsentAfterRetry = await ctx.readUnsent();
  const second = await runSenderOnce(ctx, first.state);
  const unsentAfterStored = await ctx.readUnsent();

  expect([first.step, second.step]).toStrictEqual(['retry', 'stored']);
  expect(unsentAfterRetry).toHaveLength(3);
  expect(ctx.sink.sends).toHaveLength(2);
  expect(ctx.sink.sends[1]).toStrictEqual(ctx.sink.sends[0]);
  expect(ctx.sink.facts.size).toBe(3);
  expect(unsentAfterStored).toStrictEqual([]);
});

test('it waits 1 second after the first retry and doubles the wait on each retry after', async () => {
  const ctx = setupTest();

  await ctx.fileItems(1);

  ctx.sink.answerNext(
    { kind: 'retry', reason: 'HTTP 502' },
    { kind: 'retry', reason: 'HTTP 502' },
    { kind: 'retry', reason: 'HTTP 502' },
  );

  const first = await runSenderOnce(ctx, buildInitialSenderState());
  const second = await runSenderOnce(ctx, first.state);
  const third = await runSenderOnce(ctx, second.state);

  const nextTryAts: unknown = [first, second, third].map((turn) => turn.state.nextTryAt);

  expect(nextTryAts).toStrictEqual([ctx.start + 1000, ctx.start + 2000, ctx.start + 4000]);
});

test('it records the first failure and the last error on retry', async () => {
  const ctx = setupTest();

  await ctx.fileItems(1);

  ctx.sink.answerNext({ kind: 'retry', reason: 'no answer in 10 seconds' });

  const turn = await runSenderOnce(ctx, buildInitialSenderState());

  const recorded: unknown = [turn.state.phase, turn.state.failingSince, turn.state.lastError];

  expect(recorded).toStrictEqual([
    'backing-off',
    ctx.start,
    { kind: 'retry', status: null, message: 'no answer in 10 seconds', at: ctx.start },
  ]);
});

test('it clears the backoff and the failure on stored', async () => {
  const ctx = setupTest();

  await ctx.fileItems(1);

  ctx.sink.answerNext({ kind: 'retry', reason: 'HTTP 500' });

  const failed = await runSenderOnce(ctx, buildInitialSenderState());

  ctx.setNow(ctx.start + 1000);

  const stored = await runSenderOnce(ctx, failed.state);

  expect([stored.state.retries, stored.state.failingSince, stored.state.nextTryAt]).toStrictEqual([
    0,
    null,
    null,
  ]);
});

test('it splits a refused batch in halves, sends each, and parks the one bad row', async () => {
  const ctx = setupTest();

  await ctx.fileItems(5);

  const rows = await ctx.readUnsent();

  const bad = rows.find((row) => row.seq === 4);

  invariant(bad);

  ctx.sink.refuseFact(bad.factId, 422);

  const turns = await ctx.runTurns(20);
  const counts = await ctx.readCounts();

  const good = rows.filter((row) => row.factId !== bad.factId).map((row) => row.factId);

  expect(turns.steps[0]).toBe('split');
  expect(turns.steps.at(-1)).toBe('idle');
  expect([...ctx.sink.facts.keys()]).toStrictEqual(good);
  expect(counts).toStrictEqual({ unsent: 0, parked: 1, oldestUnsentAt: null });
});

test('it parks a row that pepys refuses with 413 as too large', async () => {
  const ctx = setupTest();

  await ctx.fileItems(1);

  const [row] = await ctx.readUnsent();

  invariant(row);

  ctx.sink.refuseFact(row.factId, 413);

  const turns = await ctx.runTurns(5);

  expect(turns.steps).toStrictEqual(['parked', 'idle']);
  expect(ctx.parks.map((park) => park.reason)).toStrictEqual(['too-large']);
});

test('it parks a refused row with the reason that pepys gave', async () => {
  const ctx = setupTest();

  await ctx.fileItems(1);

  const [row] = await ctx.readUnsent();

  invariant(row);

  ctx.sink.answerNext({ kind: 'refused-batch', status: 422, reason: 'payload does not decode' });

  await runSenderOnce(ctx, buildInitialSenderState());

  expect(ctx.parks).toStrictEqual([{ ids: [row.factId], reason: 'payload does not decode' }]);
});

test('it reports blocked on a refused sink, parks nothing and tries the same batch in 5 minutes', async () => {
  const ctx = setupTest();

  await ctx.fileItems(3);

  ctx.sink.answerNext({ kind: 'refused-sink', status: 401, reason: 'wrong secret' });

  const first = await runSenderOnce(ctx, buildInitialSenderState());

  ctx.setNow(ctx.start + 300_000);

  const second = await runSenderOnce(ctx, first.state);
  const counts = await ctx.readCounts();

  const blocked: unknown = [first.step, first.state.phase, first.state.nextTryAt];
  const lastError: unknown = first.state.lastError;

  expect(blocked).toStrictEqual(['blocked', 'blocked', ctx.start + 300_000]);

  expect(lastError).toStrictEqual({
    kind: 'refused-sink',
    status: 401,
    message: 'wrong secret',
    at: ctx.start,
  });

  expect(second.step).toBe('stored');
  expect(ctx.sink.sends[1]).toStrictEqual(ctx.sink.sends[0]);
  expect(counts.parked).toBe(0);
});

test('it parks an oversize row without sending it', async () => {
  const ctx = setupTest();

  await ctx.fileItems(1, 'x'.repeat(300_000));
  await ctx.fileItems(1);

  const turns = await ctx.runTurns(5);

  expect(turns.steps).toStrictEqual(['parked', 'stored', 'idle']);
  expect(ctx.parks.map((park) => park.reason)).toStrictEqual(['too-large']);
  expect(ctx.sink.sends).toHaveLength(1);
});

test('it stops parking after 25 rows parked in a row and reports blocked', async () => {
  const ctx = setupTest();

  await ctx.fileItems(27);

  const rows = await ctx.readUnsent();

  for (const row of rows) {
    ctx.sink.refuseFact(row.factId, 422);
  }

  const turns = await ctx.runTurns(200);
  const counts = await ctx.readCounts();

  expect(turns.steps.at(-1)).toBe('blocked');
  expect(turns.state.lastError?.message).toBe('pepys refuses every fact');
  expect(counts).toMatchObject({ unsent: 2, parked: 25 });
});

test('it resets the run of parked rows when a batch is stored', async () => {
  const ctx = setupTest();

  await ctx.fileItems(3);

  const [first] = await ctx.readUnsent();

  invariant(first);

  ctx.sink.refuseFact(first.factId, 422);

  const turns = await ctx.runTurns(10);

  expect(turns.state.parkRun).toBe(0);
});

test('it keeps every row through a day with the sink down, and sends all when it is back', async () => {
  const ctx = setupTest();

  await ctx.fileItems(250);

  const dayMs = 24 * 3_600_000;
  let state = buildInitialSenderState();
  let now = ctx.start;
  let tries = 0;

  while (now < ctx.start + dayMs) {
    ctx.setNow(now);
    ctx.sink.answerNext({ kind: 'retry', reason: 'connection refused' });

    const turn = await runSenderOnce(ctx, state);

    state = turn.state;
    tries += 1;
    now = state.nextTryAt ?? now + 1;
  }

  const counts = await ctx.readCounts();

  const down = buildOutboxStatus({
    sink: 'pepys',
    state,
    counts,
    now: brandSchemas.instant.parse(now),
    isSending: false,
  });

  const last: Instant = brandSchemas.instant.parse(now);
  const nextWaitMs = (state.nextTryAt ?? last) - last;

  expect(tries).toBeLessThan(400);
  expect(nextWaitMs).toBeLessThanOrEqual(300_000);

  expect(down).toMatchObject({
    state: 'backing-off',
    unsent: 250,
    parked: 0,
    failingSince: ctx.start,
    lastError: { kind: 'retry', message: 'connection refused' },
  });

  expect(down.lag).toBeGreaterThanOrEqual(24 * 60);
  expect(ctx.sink.facts.size).toBe(0);

  const back = await ctx.runTurns(10, state);
  const counted = await ctx.readCounts();

  expect(back.steps).toStrictEqual(['stored', 'stored', 'stored', 'idle']);
  expect(ctx.sink.facts.size).toBe(250);
  expect(counted.unsent).toBe(0);
});
