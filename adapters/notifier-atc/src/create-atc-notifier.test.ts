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

  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[0]);
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
