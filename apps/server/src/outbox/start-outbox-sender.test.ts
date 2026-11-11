import { expect, onTestFinished, test } from 'bun:test';
import { outboxLimits } from '@boxxy/dispatch';
import { createFakeFactSink } from '@boxxy/dispatch/test-utils/create-fake-fact-sink';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { waitFor } from '../test-utils/wait-for.ts';
import { startOutboxSender } from './start-outbox-sender.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const sink = createFakeFactSink();

  const start = (idleMs: number) => {
    const sender = startOutboxSender({
      store: dispatch.store,
      sink,
      clock: dispatch.clock,
      limits: outboxLimits,
      random: () => 0.5,
      idleMs,
      log: {
        warn: () => {
          // the sender's log lines are not under test here
        },
      },
    });

    onTestFinished(() => sender.stop());

    return sender;
  };

  const probeAllSent = async () => {
    const counts = await dispatch.store.read((tx) => tx.readOutboxCounts());

    return counts.unsent === 0;
  };

  return { dispatch, sink, start, probeAllSent };
}

test('it sends the unsent facts of the store', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  ctx.start(10);

  await waitFor(() => ctx.sink.sends.length > 0);

  expect([...ctx.sink.facts.values()].map((fact) => fact.entity)).toStrictEqual([
    `boxxy:item:${item}`,
  ]);
});

test('it reports the status of a pepys sink with nothing unsent after the send', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({});

  const sender = ctx.start(10);

  await waitFor(ctx.probeAllSent);

  const status = await sender.status();

  expect({
    sink: status.sink,
    unsent: status.unsent,
    lastStoredAt: status.lastStoredAt,
  }).toStrictEqual({ sink: 'pepys', unsent: 0, lastStoredAt: ctx.dispatch.clock.now() });
});

test('it sends at once on a nudge in place of waiting out the idle time', async () => {
  const ctx = await setupTest();

  await ctx.dispatch.seedItem({});

  const sender = ctx.start(60_000);

  await waitFor(ctx.probeAllSent);

  await ctx.dispatch.seedItem({});

  sender.nudge();

  await waitFor(() => ctx.sink.facts.size === 2);

  expect(ctx.sink.facts.size).toBe(2);
});
