import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSQLiteClaimStore } from '../create-sqlite-claim-store.ts';
import type { SQLiteClaimStore } from '../create-sqlite-claim-store.ts';

export async function createTestClaimStore(): Promise<SQLiteClaimStore> {
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  // the process id keeps the folders of test runs that share a temp folder apart by name
  const folder = await mkdtemp(join(tmpdir(), `boxxy-store-${process.pid}-`));

  cleanup.defer(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'store.db'));

  cleanup.defer(() => store.close());

  return store;
}
