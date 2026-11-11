import { expect, test } from 'bun:test';
import type { Notifier } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createFakeNotifier } from '@boxxy/model/test-utils/create-fake-notifier';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { createNullNotifier } from './create-null-notifier.ts';
import { sendNotices } from './send-notices.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const notifier = createFakeNotifier();

  const insertNotice = (item: string) =>
    dispatch.store.exclusive((tx) =>
      tx.applyChange({
        at: dispatch.clock.now(),
        writes: [
          {
            op: 'insert',
            table: 'notices',
            row: {
              id: 1,
              item: brandSchemas.itemId.parse(item),
              reason: brandSchemas.rulesHoldReason.parse('blocked'),
              at: dispatch.clock.now(),
              tries: 0,
              sentAt: null,
            },
          },
        ],
        facts: [],
      }),
    );

  return {
    ...dispatch,
    notifier,
    insertNotice,
    send: (target: Notifier = notifier) =>
      sendNotices({ store: dispatch.store, notifier: target, now: dispatch.clock.now() }),
    listUnsent: () => dispatch.store.read((tx) => tx.listUnsentNotices(100)),
    listFactTypes: async () => {
      const facts = await dispatch.store.read((tx) => tx.readUnsentFacts(1000));

      return facts.map((fact) => fact.type);
    },
  };
}

test('it sends an unsent notice and marks it sent', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice('0190a6f4-0000-7000-8000-0000000000a1');

  const report = await ctx.send();
  const unsent = await ctx.listUnsent();

  expect([report, ctx.notifier.told.length, unsent]).toStrictEqual([
    { sent: 1, failed: 0, stuck: 0 },
    1,
    [],
  ]);
});

test('it keeps a failed notice unsent with one more try, and changes no attempt and no fact', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice('0190a6f4-0000-7000-8000-0000000000a1');

  const factsBefore = await ctx.listFactTypes();

  ctx.notifier.failNext('session offline');

  const report = await ctx.send();
  const [row] = await ctx.listUnsent();

  expect([report, row?.tries, row?.sentAt]).toStrictEqual([
    { sent: 0, failed: 1, stuck: 0 },
    1,
    null,
  ]);

  const factsAfter = await ctx.listFactTypes();

  expect(factsAfter).toStrictEqual(factsBefore);
});

test('it sends a notice again on a later tick after a failure', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice('0190a6f4-0000-7000-8000-0000000000a1');

  ctx.notifier.failNext('session offline');

  await ctx.send();

  const report = await ctx.send();
  const unsent = await ctx.listUnsent();

  expect([report.sent, unsent]).toStrictEqual([1, []]);
});

test('it stops calling the notifier after 5 failed tries and leaves the row listed', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice('0190a6f4-0000-7000-8000-0000000000a1');

  ctx.notifier.failAlways('session offline');

  for (let tick = 0; tick < 7; tick += 1) {
    await ctx.send();
  }

  const [row] = await ctx.listUnsent();
  const report = await ctx.send();

  expect([ctx.notifier.calls(), row?.tries, report]).toStrictEqual([
    5,
    5,
    { sent: 0, failed: 0, stuck: 1 },
  ]);
});

test('it counts a notifier that throws as a failed try', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice('0190a6f4-0000-7000-8000-0000000000a1');

  const report = await ctx.send({ tellHold: () => Promise.reject(new Error('socket closed')) });
  const [row] = await ctx.listUnsent();

  expect([report.failed, row?.tries]).toStrictEqual([1, 1]);
});

test('it marks every notice sent through the null notifier', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice('0190a6f4-0000-7000-8000-0000000000a1');

  const report = await ctx.send(createNullNotifier());
  const unsent = await ctx.listUnsent();

  expect([report.sent, unsent]).toStrictEqual([1, []]);
});
