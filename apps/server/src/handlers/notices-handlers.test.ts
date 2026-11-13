import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createAtcNotifier } from '@boxxy/notifier-atc';
import type { AtcSendRequest } from '@boxxy/notifier-atc';
import { z } from 'zod';
import { makeNoticeSessionRead } from '../make-notice-session-read.ts';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const requests: AtcSendRequest[] = [];

  const stopped = new Set<string>();

  // the tick sends through the atc notifier as the server wires it; the atc stand-in takes each
  // message, and answers `session_dead` for a session in `stopped`
  const server = await createTestServer({
    makeNotifier: (store) =>
      createAtcNotifier({
        client: {
          sendMessage: (request) => {
            requests.push(request);

            return stopped.has(request.session)
              ? Promise.reject(Object.assign(new Error('atc said no'), { code: 'session_dead' }))
              : Promise.resolve({ message: 'm1', status: 'queued' });
          },
        },
        readSession: makeNoticeSessionRead(store),
      }),
  });

  const call = async (procedure: 'notices.register' | 'notices.show', input: unknown) => {
    const response = await server.owner(buildRPCRequest({ procedure, input }));
    const body: unknown = await response.json();

    return { status: response.status, json: z.object({ json: z.unknown() }).parse(body).json };
  };

  return {
    ...server,
    requests,
    stopped,
    register: (gatewayID: string) => call('notices.register', { gatewayID }),
    show: () => call('notices.show', {}),
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
    readNoticeStatus: async () => {
      const response = await server.owner(
        buildRPCRequest({ procedure: 'runner.status', input: {} }),
      );

      const body: unknown = await response.json();

      const notices = z.object({ unsent: z.number(), lastError: z.string().nullable() });

      return z.object({ json: z.object({ notices }) }).parse(body).json.notices;
    },
  };
}

test('#show answers a null session before any is registered', async () => {
  const ctx = await setupTest();
  const shown = await ctx.show();

  expect(shown).toStrictEqual({ status: 200, json: { session: null } });
});

test('#register stores the gateway ID with the time it was set, and #show returns both', async () => {
  const ctx = await setupTest();

  const setAt = new Date(ctx.dispatch.clock.now()).toISOString();

  const registered = await ctx.register('desk.3.s7');
  const shown = await ctx.show();

  expect(registered).toStrictEqual({
    status: 200,
    json: { session: { gatewayID: 'desk.3.s7', setAt } },
  });

  expect(shown).toStrictEqual({
    status: 200,
    json: { session: { gatewayID: 'desk.3.s7', setAt } },
  });
});

test('#register replaces the session that was registered before', async () => {
  const ctx = await setupTest();

  await ctx.register('desk.3.s7');

  ctx.dispatch.clock.advance(60_000);

  const setAt = new Date(ctx.dispatch.clock.now()).toISOString();

  await ctx.register('desk.4.s2');

  const shown = await ctx.show();

  expect(shown).toStrictEqual({
    status: 200,
    json: { session: { gatewayID: 'desk.4.s2', setAt } },
  });
});

test.each(['owner-desk', 'desk.3', 'desk..s7', 'desk.3.s 7', ''])(
  '#register refuses "%s", which is no gateway ID, and stores nothing',
  async (gatewayID) => {
    const ctx = await setupTest();
    const refused = await ctx.register(gatewayID);
    const shown = await ctx.show();

    expect(refused.status).toBe(400);
    expect(shown).toStrictEqual({ status: 200, json: { session: null } });
  },
);

test('it leaves a notice unsent with no-notice-session in the status while no session is registered', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();
  await ctx.tick();

  const status = await ctx.readNoticeStatus();

  expect([status, ctx.requests]).toStrictEqual([{ unsent: 1, lastError: 'no-notice-session' }, []]);
});

test('#register lets a waiting notice reach a first session on its next try, with no restart', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();
  await ctx.tick();
  await ctx.register('desk.3.s7');

  ctx.dispatch.clock.advance(5000);

  await ctx.tick();

  const status = await ctx.readNoticeStatus();

  expect(ctx.requests).toStrictEqual([
    {
      session: 'desk.3.s7',
      text: expect.stringContaining('0190a6f4-0000-7000-8000-0000000000a1'),
      idempotencyKey: 'boxxy-notice:1:1',
    },
  ]);

  expect(status.unsent).toBe(0);
});

test('#register sends a notice that waits on a stopped session to the new session on its next try, with no restart', async () => {
  const ctx = await setupTest();

  ctx.stopped.add('desk.3.s7');

  await ctx.register('desk.3.s7');
  await ctx.insertNotice();
  await ctx.tick();
  await ctx.register('desk.4.s2');

  ctx.dispatch.clock.advance(5000);

  await ctx.tick();

  const status = await ctx.readNoticeStatus();

  expect(ctx.requests.map((request) => request.session)).toStrictEqual(['desk.3.s7', 'desk.4.s2']);
  expect(status.unsent).toBe(0);
});
