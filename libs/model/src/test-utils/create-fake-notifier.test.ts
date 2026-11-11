import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { createFakeNotifier } from './create-fake-notifier.ts';

function setupTest() {
  return {
    notifier: createFakeNotifier(),
    buildNotice: () => ({
      item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000a1'),
      reason: brandSchemas.rulesHoldReason.parse('blocked'),
      at: brandSchemas.instant.parse(1000),
    }),
  };
}

test('it records a sent notice', async () => {
  const ctx = setupTest();
  const notifier = ctx.notifier;
  const notice = ctx.buildNotice();

  const outcome = await notifier.tellHold(notice);

  expect([outcome, notifier.told]).toStrictEqual([{ kind: 'sent' }, [notice]]);
});

test('it fails one call after failNext and records nothing for it', async () => {
  const ctx = setupTest();
  const notifier = ctx.notifier;

  notifier.failNext('session offline');

  const first = await notifier.tellHold(ctx.buildNotice());
  const second = await notifier.tellHold(ctx.buildNotice());

  expect([first, second.kind, notifier.told]).toStrictEqual([
    { kind: 'failed', reason: 'session offline' },
    'sent',
    [ctx.buildNotice()],
  ]);
});

test('it fails every call until it recovers', async () => {
  const ctx = setupTest();
  const notifier = ctx.notifier;

  notifier.failAlways('session offline');

  const failed = await notifier.tellHold(ctx.buildNotice());

  notifier.recover();

  const sent = await notifier.tellHold(ctx.buildNotice());

  expect([failed.kind, sent.kind, notifier.calls()]).toStrictEqual(['failed', 'sent', 2]);
});
