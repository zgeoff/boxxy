import { expect, test } from 'bun:test';
import type { ItemId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockLeverChange } from '../test-utils/build-mock-lever-change.ts';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadShipRules } from '../test-utils/load-ship-rules.ts';
import { seedMergedItem } from '../test-utils/seed-merged-item.ts';
import { writeWaitNotices } from './write-wait-notices.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  dispatch.setRules(
    loadShipRules({ repos: ['  example/app: { ships: { deploy-tag: { tag: deployed/prod } } }'] }),
  );

  const forge = createFakeForge();

  return {
    ...dispatch,
    mergeItem: () => seedMergedItem(dispatch, forge, ['prod']),
    write: () =>
      writeWaitNotices({
        store: dispatch.store,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
      }),
    readNotices: () => dispatch.store.read((tx) => tx.listUnsentNotices(10)),
    readState: async (item: ItemId) => {
      const view = await dispatch.store.read((tx) =>
        tx.readItem(item, dispatch.clock.now(), dispatch.rules()),
      );

      return view?.derived;
    },
    retryAtVerify: (item: ItemId, seq: number) =>
      dispatch.store.exclusive((tx) =>
        tx.applyChange(
          buildMockLeverChange({
            seq,
            kind: 'item.retry',
            item,
            until: null,
            expiresAt: null,
            reason: null,
            phase: brandSchemas.phaseName.parse('verify'),
            actor: 'boxxy:owner:local',
            at: dispatch.clock.now(),
          }),
        ),
      ),
  };
}

test('it queues no notice for an item that has waited under six hours', async () => {
  const ctx = await setupTest();

  await ctx.mergeItem();

  ctx.clock.advance(18_000_000);

  const queued = await ctx.write();
  const notices = await ctx.readNotices();

  expect([queued, notices]).toStrictEqual([0, []]);
});

test('it queues one notify notice for an item that has waited over six hours, and the item keeps waiting', async () => {
  const ctx = await setupTest();
  const item = await ctx.mergeItem();

  ctx.clock.advance(21_600_001);

  const queued = await ctx.write();
  const again = await ctx.write();
  const notices = await ctx.readNotices();
  const state = await ctx.readState(item);

  expect([queued, again]).toStrictEqual([1, 0]);

  expect(notices.map((notice) => [notice.kind, notice.item, notice.reason])).toStrictEqual([
    ['notify', item, 'wait-overdue:shipped:6'],
  ]);

  expect(state).toStrictEqual({ state: 'waiting', reason: 'wait:shipped' });
});

test('it queues a new notice when the item returns to the step and waits over six hours again', async () => {
  const ctx = await setupTest();
  const item = await ctx.mergeItem();

  ctx.clock.advance(21_600_001);

  await ctx.write();
  await ctx.retryAtVerify(item, 2);

  const early = await ctx.write();

  ctx.clock.advance(21_600_001);

  const late = await ctx.write();
  const notices = await ctx.readNotices();

  expect([early, late, notices.length]).toStrictEqual([0, 1, 2]);
});
