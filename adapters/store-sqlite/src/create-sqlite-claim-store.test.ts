import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimStoreContract } from '@boxxy/dispatch/test-utils/claim-store-contract';
import { createSQLiteClaimStore } from './create-sqlite-claim-store.ts';
import { createTestClaimStore } from './test-utils/create-test-claim-store.ts';

async function setupTest() {
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-create-store-'));

  cleanup.defer(() => rm(folder, { recursive: true, force: true }));

  const path = join(folder, 'store.db');

  return {
    store: await createTestClaimStore(),
    createStore: () => createSQLiteClaimStore(path),
    listFiles: () => readdir(folder),
    seedForeignItemsTable: () => {
      const sqlite = new Database(path, { create: true });

      sqlite.run('CREATE TABLE items (id TEXT)');
      sqlite.close();
    },
  };
}

test.each(claimStoreContract)('it keeps the ClaimStore contract: %s', async (_title, check) => {
  const ctx = await setupTest();

  await check(ctx.store);
});

test('it closes the file when the migrations fail', async () => {
  const ctx = await setupTest();

  ctx.seedForeignItemsTable();

  const created = await ctx.createStore().then(
    () => 'created',
    () => 'refused',
  );

  const files = await ctx.listFiles();

  expect({ created, files }).toStrictEqual({ created: 'refused', files: ['store.db'] });
});
