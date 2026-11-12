import { expect, test } from 'bun:test';
import type { NoticeRow, Notifier } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { createNullNotifier } from './create-null-notifier.ts';
import { sendNotices } from './send-notices.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const notifier = createFakeNotifier();

  const insertNotice = (overrides: Partial<NoticeRow> = {}) =>
    dispatch.store.exclusive((tx) =>
      tx.applyChange({
        at: dispatch.clock.now(),
        writes: [
          {
            op: 'insert',
            table: 'notices',
            row: {
              id: 1,
              item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000a1'),
              reason: brandSchemas.rulesHoldReason.parse('blocked'),
              at: dispatch.clock.now(),
              tries: 0,
              sentAt: null,
              keySeq: 0,
              keyTries: 0,
              nextTryAt: dispatch.clock.now(),
              ...overrides,
            },
          },
        ],
        facts: [],
      }),
    );

  const send = (target: Notifier = notifier) =>
    sendNotices({ store: dispatch.store, notifier: target, now: dispatch.clock.now() });

  return {
    ...dispatch,
    refused: { kind: 'refused', reason: 'session_dead' } as const,
    uncertain: { kind: 'uncertain', reason: 'outcome_unknown' } as const,
    notifier,
    insertNotice,
    send,
    listUnsent: () => dispatch.store.read((tx) => tx.listUnsentNotices(100)),

    // one try now, then the clock moves past the next try
    sendThenWait: async () => {
      const report = await send();

      dispatch.clock.advance(900_000);

      return report;
    },
    sentKeys: () => notifier.attempts.map((notice) => notice.key),
    listFactTypes: async () => {
      const facts = await dispatch.store.read((tx) => tx.readUnsentFacts(1000));

      return facts.map((fact) => fact.type);
    },
  };
}

test('it sends an unsent notice under its key and marks it sent', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  const report = await ctx.send();
  const unsent = await ctx.listUnsent();

  expect([report, ctx.sentKeys(), unsent]).toStrictEqual([
    { sent: 1, failed: 0, lastError: null },
    ['boxxy-notice:1:0'],
    [],
  ]);
});

test('it keeps a refused notice unsent, reports the reason, and changes no fact', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  const factsBefore = await ctx.listFactTypes();

  ctx.notifier.failNext(ctx.refused);

  const report = await ctx.send();
  const [row] = await ctx.listUnsent();

  expect([report, row?.tries, row?.sentAt]).toStrictEqual([
    { sent: 0, failed: 1, lastError: 'session_dead' },
    1,
    null,
  ]);

  const factsAfter = await ctx.listFactTypes();

  expect(factsAfter).toStrictEqual(factsBefore);
});

test('it waits 5 seconds after the first try and does not try a row before its time', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  ctx.notifier.failAlways(ctx.refused);

  await ctx.send();

  ctx.clock.advance(4999);

  const early = await ctx.send();

  ctx.clock.advance(1);

  const due = await ctx.send();

  expect([early.failed, due.failed, ctx.notifier.calls()]).toStrictEqual([0, 1, 2]);
});

test.each([
  [1, 5000],
  [2, 10_000],
  [3, 20_000],
  [9, 900_000],
  [60, 900_000],
])('it sets the next try of try %i to %i ms after it', async (tries, waitMs) => {
  const ctx = await setupTest();

  await ctx.insertNotice({ tries: tries - 1 });

  ctx.notifier.failNext(ctx.refused);

  const before = ctx.clock.now();

  await ctx.send();

  const [row] = await ctx.listUnsent();

  expect(row?.nextTryAt).toBe(brandSchemas.instant.parse(before + waitMs));
});

test('it still tries a row that has 50 tries', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice({ tries: 50 });

  const report = await ctx.send();

  expect([report.sent, ctx.notifier.calls()]).toStrictEqual([1, 1]);
});

test('it sends a notice again on a later tick after a refusal, under a new key', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  ctx.notifier.failNext(ctx.refused);

  await ctx.sendThenWait();

  const report = await ctx.send();
  const unsent = await ctx.listUnsent();

  expect([report.sent, ctx.sentKeys(), unsent]).toStrictEqual([
    1,
    ['boxxy-notice:1:0', 'boxxy-notice:1:1'],
    [],
  ]);
});

test('it keeps the key after an uncertain try', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  ctx.notifier.failNext(ctx.uncertain);

  await ctx.sendThenWait();
  await ctx.send();

  expect(ctx.sentKeys()).toStrictEqual(['boxxy-notice:1:0', 'boxxy-notice:1:0']);
});

test('it takes a new key after the third uncertain try', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  ctx.notifier.failAlways(ctx.uncertain);

  for (let tick = 0; tick < 4; tick += 1) {
    await ctx.sendThenWait();
  }

  const [row] = await ctx.listUnsent();

  expect([ctx.sentKeys(), row?.keySeq, row?.keyTries]).toStrictEqual([
    ['boxxy-notice:1:0', 'boxxy-notice:1:0', 'boxxy-notice:1:0', 'boxxy-notice:1:1'],
    1,
    1,
  ]);
});

test('it keeps the key after a refused try that follows an uncertain one', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  ctx.notifier.failNext(ctx.uncertain);

  await ctx.sendThenWait();

  ctx.notifier.failNext(ctx.refused);

  await ctx.sendThenWait();
  await ctx.send();

  expect(ctx.sentKeys()).toStrictEqual([
    'boxxy-notice:1:0',
    'boxxy-notice:1:0',
    'boxxy-notice:1:0',
  ]);
});

test('it keeps the key of a row across a restart, because the key comes from the row', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice({ keySeq: 4, keyTries: 2 });

  ctx.notifier.failNext(ctx.uncertain);

  await ctx.send();

  const [row] = await ctx.listUnsent();

  expect([ctx.sentKeys(), row?.keySeq, row?.keyTries]).toStrictEqual([['boxxy-notice:1:4'], 5, 0]);
});

test('it counts a notifier that throws as an uncertain try', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  const report = await ctx.send({ tellHold: () => Promise.reject(new Error('socket closed')) });
  const [row] = await ctx.listUnsent();

  expect([report, row?.tries, row?.keyTries]).toStrictEqual([
    { sent: 0, failed: 1, lastError: 'socket closed' },
    1,
    1,
  ]);
});

test('it marks every notice sent through the null notifier', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();

  const report = await ctx.send(createNullNotifier());
  const unsent = await ctx.listUnsent();

  expect([report.sent, unsent]).toStrictEqual([1, []]);
});
