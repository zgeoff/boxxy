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
  };

  return { sent, notice };
}

test('it sends one message to the named session with the item, the reason and the next steps', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: {
      sendMessage: (request) => {
        ctx.sent.push(request);

        return Promise.resolve({ message: 'm1', status: 'queued' });
      },
    },
    session: 'owner-desk',
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect(outcome).toStrictEqual({ kind: 'sent' });

  expect(ctx.sent).toStrictEqual([
    {
      session: 'owner-desk',
      text: [
        'boxxy put 01900000-0000-7000-8000-000000000007 on hold: attempts used up.',
        'Add a note with `boxxy item note 01900000-0000-7000-8000-000000000007`, then run `boxxy item retry 01900000-0000-7000-8000-000000000007`.',
      ].join('\n'),
      idempotencyKey: expect.any(String),
    },
  ]);
});

test('it sends the same idempotency key for the same notice and another for another notice', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: {
      sendMessage: (request) => {
        ctx.sent.push(request);

        return Promise.resolve({});
      },
    },
    session: 'owner-desk',
  });

  await notifier.tellHold(ctx.notice);
  await notifier.tellHold(ctx.notice);
  await notifier.tellHold({ ...ctx.notice, reason: 'rounds used up' });

  const keys = ctx.sent.map((request) => request.idempotencyKey);

  expect([keys.length, new Set(keys.slice(0, 2)).size, new Set(keys).size]).toStrictEqual([
    3, 1, 2,
  ]);
});

test('it sends a fresh idempotency key on the next try after atc refuses the send', async () => {
  const ctx = setupTest();
  let refusals = 1;

  const notifier = createAtcNotifier({
    client: {
      sendMessage: (request) => {
        ctx.sent.push(request);

        refusals -= 1;

        return refusals >= 0
          ? Promise.reject(Object.assign(new Error('refused'), { code: 'session_busy' }))
          : Promise.resolve({});
      },
    },
    session: 'owner-desk',
  });

  await notifier.tellHold(ctx.notice);

  const outcome = await notifier.tellHold(ctx.notice);

  expect([outcome, new Set(ctx.sent.map((request) => request.idempotencyKey)).size]).toStrictEqual([
    { kind: 'sent' },
    2,
  ]);
});

test.each([['outcome_unknown'], ['idempotency_key_unknown']])(
  'it repeats the idempotency key on the next try after atc answers %s',
  async (code) => {
    const ctx = setupTest();
    let refusals = 1;

    const notifier = createAtcNotifier({
      client: {
        sendMessage: (request) => {
          ctx.sent.push(request);

          refusals -= 1;

          return refusals >= 0
            ? Promise.reject(Object.assign(new Error('refused'), { code }))
            : Promise.resolve({});
        },
      },
      session: 'owner-desk',
    });

    await notifier.tellHold(ctx.notice);
    await notifier.tellHold(ctx.notice);

    expect(new Set(ctx.sent.map((request) => request.idempotencyKey)).size).toBe(1);
  },
);

test('it returns failed with outcome_unknown when atc cannot tell whether it sent', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: {
      sendMessage: () =>
        Promise.reject(Object.assign(new Error('refused'), { code: 'outcome_unknown' })),
    },
    session: 'owner-desk',
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'outcome_unknown' });
});

test('it repeats the idempotency key on the next try after a send that got no atc answer', async () => {
  const ctx = setupTest();
  let losses = 1;

  const notifier = createAtcNotifier({
    client: {
      sendMessage: (request) => {
        ctx.sent.push(request);

        losses -= 1;

        return losses >= 0 ? Promise.reject(new Error('socket closed')) : Promise.resolve({});
      },
    },
    session: 'owner-desk',
  });

  await notifier.tellHold(ctx.notice);
  await notifier.tellHold(ctx.notice);

  const keys = ctx.sent.map((request) => request.idempotencyKey);

  expect([keys.length, new Set(keys).size]).toStrictEqual([2, 1]);
});

test('it returns failed with the atc error code when the session does not exist', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: {
      sendMessage: () =>
        Promise.reject(
          Object.assign(new Error('no session named owner-desk'), { code: 'no_such_session' }),
        ),
    },
    session: 'owner-desk',
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'no_such_session' });
});

test('it returns failed without the error text when the send fails with no code', async () => {
  const ctx = setupTest();

  const notifier = createAtcNotifier({
    client: { sendMessage: () => Promise.reject(new Error('connect refused with token abc')) },
    session: 'owner-desk',
  });

  const outcome = await notifier.tellHold(ctx.notice);

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'atc send failed' });
});
