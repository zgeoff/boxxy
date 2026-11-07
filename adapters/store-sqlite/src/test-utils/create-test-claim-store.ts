import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSQLiteClaimStore } from '../create-sqlite-claim-store.ts';
import type { SQLiteClaimStore } from '../create-sqlite-claim-store.ts';

// A store in a file of its own, which the test's end closes and removes.
export async function createTestClaimStore(): Promise<SQLiteClaimStore> {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-store-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'store.db'));

  onTestFinished(() => store.close());

  return store;
}
