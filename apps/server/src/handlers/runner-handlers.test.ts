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
                item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000a1'),
                reason: brandSchemas.rulesHoldReason.parse('blocked'),
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
    readNotices: async () => {
      const response = await server.owner(
        buildRPCRequest({ procedure: 'runner.status', input: {} }),
      );

      const body: unknown = await response.json();

      return z.object({ json: z.object({ notices: z.unknown() }) }).parse(body).json.notices;
    },
  };
}

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
