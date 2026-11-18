import { expect, test } from 'bun:test';
import { createFakeForge } from './create-fake-forge.ts';
import { createTestDispatch } from './create-test-dispatch.ts';
import { loadShipRules } from './load-ship-rules.ts';
import { seedMergedItem, seededMergeCommit } from './seed-merged-item.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();

  dispatch.setRules(loadShipRules({ repos: ['  example/app: { ships: { release: {} } }'] }));

  return {
    dispatch,
    forge,
    readPullRequests: async (item: Parameters<typeof dispatch.closeItem>[0]) => {
      const detail = await dispatch.store.read((tx) =>
        tx.readItemDetail(item, dispatch.clock.now(), dispatch.rules()),
      );

      return detail?.pullRequests ?? [];
    },
  };
}

test('it seeds an item whose pull request merged at the seeded commit', async () => {
  const ctx = await setupTest();
  const item = await seedMergedItem(ctx.dispatch, ctx.forge, ['prod']);
  const rows = await ctx.readPullRequests(item);

  const received: unknown = rows.map((row) => [row.state, row.mergeCommit]);

  expect(received).toStrictEqual([['merged', seededMergeCommit]]);
});

test('it leaves the pull request open when the input says it has not merged', async () => {
  const ctx = await setupTest();
  const item = await seedMergedItem(ctx.dispatch, ctx.forge, ['prod'], { isMerged: false });
  const rows = await ctx.readPullRequests(item);

  expect(rows.map((row) => row.state)).toStrictEqual(['open']);
});

test('it links the pull request with the number the input gives', async () => {
  const ctx = await setupTest();
  const item = await seedMergedItem(ctx.dispatch, ctx.forge, [], { number: 12 });
  const rows = await ctx.readPullRequests(item);

  expect(rows.map((row) => row.number)).toStrictEqual([12]);
});
