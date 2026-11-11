import { expect, onTestFinished, test } from 'bun:test';
import { createTestServer } from '@boxxy/server/test-utils/create-test-server';
import { runOutboxSender } from './run-outbox-sender.ts';
import { startPepysUnderTest } from './start-pepys-under-test.ts';

async function setupTest() {
  const pepys = await startPepysUnderTest();

  onTestFinished(() => pepys[Symbol.asyncDispose]());

  const server = await createTestServer();

  return {
    pepys,
    server,
    sendFacts: () =>
      runOutboxSender({
        store: server.deps.store,
        sink: pepys.sink,
        clock: server.dispatch.clock,
      }),
  };
}

test('it answers the cost of an item from the facts that the sink sent', async () => {
  const ctx = await setupTest();
  const build = await ctx.server.dispatch.seedBuild();

  await ctx.sendFacts();

  const cost = await ctx.pepys.reader.readCostToLand(build.item);

  expect(cost).toMatchObject({ kind: 'value', value: { attempts: 1, landedAt: null } });
});

test('it takes the merge webhook with the signature that GitHub would send', async () => {
  const ctx = await setupTest();

  const answer = await ctx.pepys.sendMergeWebhook({
    githubId: 9_000_011,
    repo: 'example/app',
    number: 11,
    title: 'Follow the system theme',
    openedAt: '2026-11-11T02:30:00Z',
    mergedAt: '2026-11-11T05:00:00Z',
    mergeCommit: 'e'.repeat(40),
  });

  expect(answer.status).toBe(200);
});
