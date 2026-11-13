import { expect, test } from 'bun:test';
import type { HoldNotice } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createAtcNotifier } from './create-atc-notifier.ts';
import type { AtcSendRequest } from './types.ts';

function setupTest() {
  const sent: AtcSendRequest[] = [];

  const notice: HoldNotice = {
    item: brandSchemas.itemId.parse('01900000-0000-7000-8000-000000000007'),
    reason: 'attempts used up',
    at: brandSchemas.instant.parse(1_800_000_000_000),
    key: 'boxxy-notice:12:3',
  };

  return {
    sent,
    notice,

    // takes every message
    client: {
      sendMessage: (request: AtcSendRequest) => {
        sent.push(request);

        return Promise.resolve({ message: 'm1', status: 'queued' });
      },
    },
    createNotifier: (code: string | null) =>
      createAtcNotifier({
        client: {
          sendMessage: (request) => {
            sent.push(request);

            if (code === null) {
              return Promise.resolve({ message: 'm1', status: 'queued' });
            }

            return Promise.reject(Object.assign(new Error('atc said no'), { code }));
          },
        },
        readSession: () => Promise.resolve('daemon.1.s1'),
      }),
  };
}

test('it sends one message to the session with the item, the reason, the next steps and the key', async () => {
  const ctx = setupTest();
  const notifier = ctx.createNotifier(null);

  const outcome = await notifier.tellHold(ctx.notice);

  expect([outcome, ctx.sent]).toStrictEqual([
    { kind: 'sent' },
    [
      {
        session: 'daemon.1.s1',
        text: [
          'boxxy put 01900000-0000-7000-8000-000000000007 on hold: attempts used up.',
          'Add a note with `boxxy item note 01900000-0000-7000-8000-000000000007`, then run `boxxy item retry 01900000-0000-7000-8000-000000000007`.',
        ].join('\n'),
        idempotencyKey: 'boxxy-notice:12:3',
      },
    ],
  ]);
});

test('it sends the key it gets again on a second call, with no state of its own', async () => {
  const ctx = setupTest();
  const notifier = ctx.createNotifier('session_dead');

  await notifier.tellHold(ctx.notice);
  await notifier.tellHold(ctx.notice);

  expect(ctx.sent.map((request) => request.idempotencyKey)).toStrictEqual([
    'boxxy-notice:12:3',
    'boxxy-notice:12:3',
  ]);
});

test.each(['no_such_session', 'session_dead', 'unsupported', 'daemon_unavailable', 'bad_args'])(
  'it returns refused for the atc code %s',
  async (code) => {
    const ctx = setupTest();

    const outcome = await ctx.createNotifier(code).tellHold(ctx.notice);

    expect(outcome).toStrictEqual({ kind: 'refused', reason: code });
  },
);

test.each(['outcome_unknown', 'idempotency_conflict', 'idempotency_key_unknown', 'something_new'])(
  'it returns uncertain for the atc code %s',
  async (code) => {
    const ctx = setupTest();

    const outcome = await ctx.createNotifier(code).tellHold(ctx.notice);

    expect(outcome).toStrictEqual({ kind: 'uncertain', reason: code });
  },
);

test('it returns uncertain without the error text when the send fails with no code', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: { sendMessage: () => Promise.reject(new Error('connect refused with token abc')) },
    readSession: () => Promise.resolve('daemon.1.s1'),
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect(outcome).toStrictEqual({ kind: 'uncertain', reason: 'atc send failed' });
});

test('it returns refused with no-notice-session and sends nothing when no session is set', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: ctx.client,
    readSession: () => Promise.resolve(null),
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect([outcome, ctx.sent]).toStrictEqual([{ kind: 'refused', reason: 'no-notice-session' }, []]);
});

test('it reads the session on each call, so the second message goes to a session set in between', async () => {
  const ctx = setupTest();
  const sessions = ['daemon.1.s1', 'daemon.2.s4'];

  const notifier = createAtcNotifier({
    client: ctx.client,
    readSession: () => Promise.resolve(sessions.shift() ?? null),
  });

  await notifier.tellHold(ctx.notice);
  await notifier.tellHold(ctx.notice);

  expect(ctx.sent.map((request) => request.session)).toStrictEqual(['daemon.1.s1', 'daemon.2.s4']);
});

test('it returns refused without the error text and sends nothing when the session read fails', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: ctx.client,
    readSession: () => Promise.reject(new Error('the store file is locked')),
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect([outcome, ctx.sent]).toStrictEqual([
    { kind: 'refused', reason: 'notice-session-unread' },
    [],
  ]);
});
