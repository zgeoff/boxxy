import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import type { StoreDatabase } from '../types.ts';
import { takeWriteLock } from './take-write-lock.ts';

async function setupTest() {
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-write-lock-'));

  cleanup.defer(() => rm(folder, { recursive: true, force: true }));

  const openHandle = () => {
    const sqlite = new Database(join(folder, 'store.db'), { create: true });

    cleanup.defer(() => {
      sqlite.close();
    });

    const db = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(sqlite) });

    cleanup.defer(() => db.destroy());

    return db;
  };

  const holder = openHandle();
  const waiter = openHandle();

  return {
    holdLock: () => takeWriteLock(holder, 0),
    takeLock: (waitLimitMs: number) => takeWriteLock(waiter, waitLimitMs),
  };
}

test('it rejects with a busy error once another handle holds the lock for the wait limit', async () => {
  const ctx = await setupTest();

  await ctx.holdLock();

  const startMs = performance.now();

  const refusal: unknown = await ctx.takeLock(50).then(
    () => null,
    (error: unknown) => error,
  );

  const waitedMs = performance.now() - startMs;

  expect(refusal).toMatchObject({ code: 'SQLITE_BUSY' });
  expect(waitedMs).toBeGreaterThanOrEqual(50);
});
