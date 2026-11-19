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

test('#tellPaused sends one message that names the pause time, the actor, the reason, the count and the key', async () => {
  const ctx = setupTest();
  const notifier = ctx.createNotifier(null);

  const outcome = await notifier.tellPaused({
    at: brandSchemas.instant.parse(1_800_000_000_000 + 2 * 3_600_000 + 60_000),
    pausedAt: brandSchemas.instant.parse(1_800_000_000_000),
    pausedBy: 'boxxy:owner:local',
    reason: 'the rules change is in review',
    waiting: 3,
    key: 'boxxy-notice:13:0',
  });

  expect([outcome, ctx.sent]).toStrictEqual([
    { kind: 'sent' },
    [
      {
        session: 'daemon.1.s1',
        text: [
          'The boxxy runner has been paused for 2 hours, by boxxy:owner:local. 3 items are ready to claim.',
          'Reason: the rules change is in review.',
          'Run `boxxy runner resume` to start claiming again.',
        ].join('\n'),
        idempotencyKey: 'boxxy-notice:13:0',
      },
    ],
  ]);
});

test('#tellPaused says none given when the pause has no reason, and refuses with no session', async () => {
  const ctx = setupTest();

  const notice = {
    at: brandSchemas.instant.parse(1_800_000_000_000 + 3 * 3_600_000),
    pausedAt: brandSchemas.instant.parse(1_800_000_000_000),
    pausedBy: 'boxxy:owner:local',
    reason: null,
    waiting: 1,
    key: 'boxxy-notice:14:0',
  } as const;

  await ctx.createNotifier(null).tellPaused(notice);

  const refused = await createAtcNotifier({
    client: ctx.client,
    readSession: () => Promise.resolve(null),
  }).tellPaused(notice);

  expect([ctx.sent.map((request) => request.text.split('\n')[1]), refused]).toStrictEqual([
    ['Reason: none given.'],
    { kind: 'refused', reason: 'no-notice-session' },
  ]);
});

test('#tellNotify sends one message that names the phase, the reason, the item and the key', async () => {
  const ctx = setupTest();
  const notifier = ctx.createNotifier(null);

  const outcome = await notifier.tellNotify({
    item: ctx.notice.item,
    phase: brandSchemas.phaseName.parse('live'),
    reason: 'wait-skip:shipped',
    at: ctx.notice.at,
    key: 'boxxy-notice:15:0',
  });

  expect([outcome, ctx.sent]).toStrictEqual([
    { kind: 'sent' },
    [
      {
        session: 'daemon.1.s1',
        text: [
          'boxxy settled the live step of 01900000-0000-7000-8000-000000000007: wait-skip:shipped.',
          'Read the item with `boxxy item show 01900000-0000-7000-8000-000000000007`.',
        ].join('\n'),
        idempotencyKey: 'boxxy-notice:15:0',
      },
    ],
  ]);
});

test('#tellNotify tells the owner that an item waited over its hours at a step and still waits', async () => {
  const ctx = setupTest();
  const notifier = ctx.createNotifier(null);

  await notifier.tellNotify({
    item: ctx.notice.item,
    phase: brandSchemas.phaseName.parse('live'),
    reason: 'wait-overdue:shipped:6',
    at: ctx.notice.at,
    key: 'boxxy-notice:16:0',
  });

  expect(ctx.sent.map((request) => request.text)).toStrictEqual([
    [
      '01900000-0000-7000-8000-000000000007 has waited more than 6 hours at the live step for shipped, and still waits.',
      'Read the item with `boxxy item show 01900000-0000-7000-8000-000000000007`.',
    ].join('\n'),
  ]);
});
