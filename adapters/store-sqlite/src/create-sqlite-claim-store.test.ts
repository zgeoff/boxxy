import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimStoreContract } from '@boxxy/dispatch/test-utils/claim-store-contract';
import { brandSchemas } from '@boxxy/model';
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
    createStore: async () => {
      const store = await createSQLiteClaimStore(path);

      cleanup.defer(() => store.close());

      return store;
    },
    listFiles: () => readdir(folder),
    removeFiles: async () => {
      const files = await readdir(folder);

      await Promise.all(files.map((file) => rm(join(folder, file))));
    },
    createForeignItemsTable: () => {
      const sqlite = new Database(path, { create: true });

      sqlite.run('CREATE TABLE items (id TEXT)');
      sqlite.close();
    },
  };
}

test.each(claimStoreContract)('it keeps the ClaimStore contract: %s', async (_title, check) => {
  const ctx = await setupTest();
  const outcome = await check(ctx.store);

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it closes the file when the migrations fail', async () => {
  const ctx = await setupTest();

  ctx.createForeignItemsTable();

  const created = await ctx.createStore().then(
    () => 'created',
    () => 'refused',
  );

  const files = await ctx.listFiles();

  expect({ created, files }).toStrictEqual({ created: 'refused', files: ['store.db'] });
});

test('it runs the exclusive calls of two stores on one file one after the other', async () => {
  const ctx = await setupTest();
  const first = await ctx.createStore();
  const second = await ctx.createStore();

  const secondCall = Promise.withResolvers<void>();

  await first.exclusive(async (transaction) => {
    await transaction.writeHeartbeat(
      brandSchemas.runnerId.parse('runner-1'),
      brandSchemas.instant.parse(1000),
    );

    secondCall.resolve(
      second.exclusive((other) =>
        other.writeHeartbeat(
          brandSchemas.runnerId.parse('runner-2'),
          brandSchemas.instant.parse(2000),
        ),
      ),
    );

    await transaction.listPoolSlots();
    await transaction.listPoolSlots();
  });

  await secondCall.promise;

  const runners = await second.read(async (transaction) => [
    await transaction.readRunner(brandSchemas.runnerId.parse('runner-1')),
    await transaction.readRunner(brandSchemas.runnerId.parse('runner-2')),
  ]);

  const beats: unknown = runners.map((runner) => runner?.heartbeatAt);

  expect(beats).toStrictEqual([1000, 2000]);
});

test('it opens one new file from two stores started together', async () => {
  const ctx = await setupTest();
  const opened = await Promise.allSettled([ctx.createStore(), ctx.createStore()]);

  expect(opened.map((result) => result.status)).toStrictEqual(['fulfilled', 'fulfilled']);
});

test('it creates no file for a read after the file of the store is removed', async () => {
  const ctx = await setupTest();
  const store = await ctx.createStore();

  await ctx.removeFiles();

  const read = await store
    .read((transaction) => transaction.listPoolSlots())
    .then(
      () => 'resolved',
      () => 'rejected',
    );

  const files = await ctx.listFiles();

  expect({ read, files }).toStrictEqual({ read: 'rejected', files: [] });
});
