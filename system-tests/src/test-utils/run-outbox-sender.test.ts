import { expect, test } from 'bun:test';
import { createFakeFactSink } from '@boxxy/dispatch/test-utils/create-fake-fact-sink';
import { createTestServer } from '@boxxy/server/test-utils/create-test-server';
import { runOutboxSender } from './run-outbox-sender.ts';

async function setupTest() {
  const server = await createTestServer();

  const sink = createFakeFactSink();

  return {
    server,
    sink,
    runSender: () =>
      runOutboxSender({ store: server.deps.store, sink, clock: server.dispatch.clock }),
    readCounts: () => server.deps.store.read((tx) => tx.readOutboxCounts()),
  };
}

test('it sends every unsent fact and stops on the turn that finds none', async () => {
  const ctx = await setupTest();

  await ctx.server.dispatch.seedItem({});

  const steps = await ctx.runSender();
  const counts = await ctx.readCounts();

  expect({ steps, unsent: counts.unsent }).toStrictEqual({ steps: ['stored', 'idle'], unsent: 0 });
});

test('it stops at a retry answer and leaves the facts unsent', async () => {
  const ctx = await setupTest();

  await ctx.server.dispatch.seedItem({});

  ctx.sink.answerNext({ kind: 'retry', reason: 'pepys answered 503' });

  const steps = await ctx.runSender();
  const counts = await ctx.readCounts();

  expect({ steps, unsent: counts.unsent }).toStrictEqual({ steps: ['retry'], unsent: 1 });
});
