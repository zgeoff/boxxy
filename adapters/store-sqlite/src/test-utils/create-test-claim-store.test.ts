import { expect, onTestFinished, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createTestClaimStore } from './create-test-claim-store.ts';

function setupTest() {
  return {
    listStoreFolders: async () => {
      const names = await readdir(tmpdir());

      return names.filter((name) => name.startsWith('boxxy-store-'));
    },
  };
}

test('it opens an empty migrated store', async () => {
  const store = await createTestClaimStore();
  const lag = await store.read((transaction) => transaction.readOutboxLag());

  expect(lag).toStrictEqual({ unsent: 0, oldestUnsentAt: null });
});

test('it closes the store and removes its folder when the test finishes', async () => {
  const ctx = setupTest();

  const before = await ctx.listStoreFolders();
  const store = await createTestClaimStore();

  onTestFinished(async () => {
    const read = await store
      .read((transaction) => transaction.readOutboxLag())
      .then(
        () => 'read',
        () => 'refused',
      );

    const folders = await ctx.listStoreFolders();

    expect({ read, folders }).toStrictEqual({ read: 'refused', folders: before });
  });
});
