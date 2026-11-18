import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const server = await createTestServer();

  return {
    ...server,
    insertNotice: () =>
      server.deps.store.exclusive((tx) =>
        tx.applyChange({
          at: server.dispatch.clock.now(),
          writes: [
            {
              op: 'insert',
              table: 'notices',
              row: {
                id: 1,
                kind: 'hold',
                item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000a1'),
                reason: brandSchemas.rulesHoldReason.parse('blocked'),
                pause: null,
                at: server.dispatch.clock.now(),
                tries: 0,
                sentAt: null,
                keySeq: 0,
                keyTries: 0,
                nextTryAt: server.dispatch.clock.now(),
              },
            },
          ],
          facts: [],
        }),
      ),
    call: async (procedure: string, input: unknown) => {
      const response = await server.owner(buildRPCRequest({ procedure, input }));
      const body: unknown = await response.json();

      return z.object({ json: z.unknown() }).parse(body).json;
    },
    readRunnerFacts: async () => {
      const facts = await server.deps.store.read((tx) => tx.readUnsentFacts(1000));

      return facts
        .filter((fact) => fact.type.startsWith('boxxy.runner.'))
        .map((fact) => ({
          type: fact.type,
          entity: fact.entity,
          actor: fact.actor,
          at: fact.at,
          payload: fact.payload,
        }));
    },
    readPause: async () => {
      const response = await server.owner(
        buildRPCRequest({ procedure: 'runner.status', input: {} }),
      );

      const body: unknown = await response.json();

      return z.object({ json: z.object({ pause: z.unknown() }) }).parse(body).json.pause;
    },
    readCapacityRefusals: async () => {
      const response = await server.owner(
        buildRPCRequest({ procedure: 'runner.status', input: {} }),
      );

      const body: unknown = await response.json();

      return z.object({ json: z.object({ capacityRefusals: z.unknown() }) }).parse(body).json
        .capacityRefusals;
    },
    readNotices: async () => {
      const response = await server.owner(
        buildRPCRequest({ procedure: 'runner.status', input: {} }),
      );

      const body: unknown = await response.json();

      return z.object({ json: z.object({ notices: z.unknown() }) }).parse(body).json.notices;
    },
  };
}

test('#status shows no capacity refusal before any attempt ran out of capacity', async () => {
  const ctx = await setupTest();
  const refusals = await ctx.readCapacityRefusals();

  expect(refusals).toStrictEqual({ latest: null, sinceLastSpawn: 0 });
});

test('#status shows no oldest time and no error when every notice is sent', async () => {
  const ctx = await setupTest();
  const notices = await ctx.readNotices();

  expect(notices).toStrictEqual({
    unsent: 0,
    oldestUnsentAt: null,
    lastError: null,
  });
});

test('#status shows the oldest unsent time and the reason of the last try that was not sent', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  const at = ctx.dispatch.clock.now();

  ctx.notifier.failNext({ kind: 'refused', reason: 'session_dead' });

  await ctx.tick();

  const notices = await ctx.readNotices();

  expect(notices).toStrictEqual({
    unsent: 1,
    oldestUnsentAt: new Date(at).toISOString(),
    lastError: 'session_dead',
  });
});

test('#pause writes one fact with the actor, the time and the reason, and logs one line', async () => {
  const ctx = await setupTest();

  const at = ctx.dispatch.clock.now();

  const answer = await ctx.call('runner.pause', { reason: 'the rules change is in review' });

  expect([answer, await ctx.readRunnerFacts(), ctx.logged]).toStrictEqual([
    { paused: true },
    [
      {
        type: 'boxxy.runner.paused',
        entity: `boxxy:runner:${ctx.dispatch.runner}`,
        actor: 'boxxy:owner:local',
        at,
        payload: { runner: ctx.dispatch.runner, reason: 'the rules change is in review' },
      },
    ],
    [
      {
        message: 'the runner was paused',
        fields: { by: 'boxxy:owner:local', reason: 'the rules change is in review' },
      },
    ],
  ]);
});

test('#pause with no reason stores a null reason', async () => {
  const ctx = await setupTest();

  await ctx.call('runner.pause', {});

  const facts = await ctx.readRunnerFacts();

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    { runner: ctx.dispatch.runner, reason: null },
  ]);
});

test('#pause of a paused runner writes no second fact and keeps the first reason', async () => {
  const ctx = await setupTest();

  await ctx.call('runner.pause', { reason: 'the first reason' });

  ctx.dispatch.clock.advance(60_000);

  await ctx.call('runner.pause', { reason: 'a second reason' });

  const facts = await ctx.readRunnerFacts();
  const pause = await ctx.readPause();

  expect([facts.length, pause, ctx.logged.length]).toStrictEqual([
    1,
    {
      since: new Date(ctx.dispatch.clock.now() - 60_000).toISOString(),
      by: 'boxxy:owner:local',
      reason: 'the first reason',
    },
    1,
  ]);
});

test('#resume writes one fact and logs one line', async () => {
  const ctx = await setupTest();

  await ctx.call('runner.pause', {});

  ctx.dispatch.clock.advance(60_000);

  const answer = await ctx.call('runner.resume', {});
  const facts = await ctx.readRunnerFacts();

  expect([
    answer,
    facts.map((fact) => [fact.type, fact.actor, fact.at, fact.payload]),
    ctx.logged.at(-1),
  ]).toStrictEqual([
    { paused: false },
    [
      [
        'boxxy.runner.paused',
        'boxxy:owner:local',
        ctx.dispatch.clock.now() - 60_000,
        { runner: ctx.dispatch.runner, reason: null },
      ],
      [
        'boxxy.runner.resumed',
        'boxxy:owner:local',
        ctx.dispatch.clock.now(),
        { runner: ctx.dispatch.runner },
      ],
    ],
    { message: 'the runner was resumed', fields: { by: 'boxxy:owner:local' } },
  ]);
});

test('#resume of a running runner writes no fact and logs nothing', async () => {
  const ctx = await setupTest();

  await ctx.tick();
  await ctx.call('runner.resume', {});

  expect([await ctx.readRunnerFacts(), ctx.logged]).toStrictEqual([[], []]);
});

test('#status shows no pause while the runner runs and since, by and reason while it is paused', async () => {
  const ctx = await setupTest();

  await ctx.tick();

  const running = await ctx.readPause();

  await ctx.call('runner.pause', { reason: 'the deploy is half done' });

  const paused = await ctx.readPause();

  expect([running, paused]).toStrictEqual([
    null,
    {
      since: new Date(ctx.dispatch.clock.now()).toISOString(),
      by: 'boxxy:owner:local',
      reason: 'the deploy is half done',
    },
  ]);
});

test('#status shows a null reason for a pause with none', async () => {
  const ctx = await setupTest();

  await ctx.call('runner.pause', {});

  const pause = await ctx.readPause();

  expect(pause).toStrictEqual({
    since: new Date(ctx.dispatch.clock.now()).toISOString(),
    by: 'boxxy:owner:local',
    reason: null,
  });
});

test('it queues one notice at a tick two hours into a pause with a ready item, and no later tick queues another', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({});
  await ctx.call('runner.pause', { reason: 'the rules change is in review' });

  const pausedAt = ctx.dispatch.clock.now();

  ctx.dispatch.clock.advance(2 * 3_600_000);

  await ctx.tick();

  ctx.dispatch.clock.advance(600_000);

  await ctx.tick();

  expect(ctx.notifier.toldPaused).toStrictEqual([
    {
      at: brandSchemas.instant.parse(pausedAt + 2 * 3_600_000),
      pausedAt,
      pausedBy: 'boxxy:owner:local',
      reason: 'the rules change is in review',
      waiting: 1,
      key: 'boxxy-notice:1:0',
    },
  ]);
});

test('it queues no notice at a tick just short of two hours into a pause', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({});
  await ctx.call('runner.pause', {});

  ctx.dispatch.clock.advance(2 * 3_600_000 - 1);

  await ctx.tick();

  expect(ctx.notifier.toldPaused).toStrictEqual([]);
});

test('it queues no notice at a tick two hours into a pause with no ready item', async () => {
  const ctx = await setupTest();

  await ctx.call('runner.pause', {});

  ctx.dispatch.clock.advance(2 * 3_600_000);

  await ctx.tick();

  expect(ctx.notifier.toldPaused).toStrictEqual([]);
});

test('it sends a notice that atc refused again on a later tick, and queues no second one', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({});
  await ctx.call('runner.pause', {});

  ctx.dispatch.clock.advance(2 * 3_600_000);
  ctx.notifier.failNext({ kind: 'refused', reason: 'no-notice-session' });

  await ctx.tick();

  ctx.dispatch.clock.advance(900_000);

  await ctx.tick();

  expect(ctx.notifier.toldPaused.map((notice) => notice.waiting)).toStrictEqual([1]);
});

test('it sends a notice for a second pause after a resume', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({});
  await ctx.call('runner.pause', {});

  ctx.dispatch.clock.advance(2 * 3_600_000);

  await ctx.tick();
  await ctx.call('runner.resume', {});
  await ctx.call('runner.pause', { reason: 'a second pause' });

  ctx.dispatch.clock.advance(2 * 3_600_000);

  await ctx.tick();

  expect(ctx.notifier.toldPaused.map((notice) => notice.reason)).toStrictEqual([
    null,
    'a second pause',
  ]);
});
