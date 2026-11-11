import { Database } from 'bun:sqlite';
import type { ClaimStore, StoreReader } from '@boxxy/model';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely, sql } from 'kysely';
import { buildSQLiteReader } from './build-sqlite-reader.ts';
import { createSQLiteTx } from './create-sqlite-tx.ts';
import { runStoreMigrations } from './run-store-migrations.ts';
import { takeWriteLock } from './take-write-lock.ts';
import type { StoreDatabase } from './types.ts';
import { withTransaction } from './with-transaction.ts';

export interface SQLiteClaimStore extends ClaimStore {
  close: () => Promise<void>;
}

export async function createSQLiteClaimStore(path: string): Promise<SQLiteClaimStore> {
  await using opened = new AsyncDisposableStack();

  const writer = openStoreHandle(path, { create: true, busyTimeoutMs: 0 });

  opened.defer(() => {
    writer.close();
  });

  const writerDB = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(writer) });

  opened.defer(() => writerDB.destroy());

  await runStoreMigrations(writerDB);

  const handles = opened.move();

  const reads = new Set<Promise<unknown>>();

  let isClosed = false;

  return {
    // Kysely holds the one connection of a handle from acquire to release, so two calls on this
    // store run one at a time, and the write lock makes another store's writer wait.
    exclusive: (work) =>
      writerDB
        .connection()
        .execute((db) => withTransaction(db, takeWriteLock, () => work(createSQLiteTx(db)))),

    read: async (work) => {
      if (isClosed) {
        throw new Error('the store is closed');
      }

      const reading = withReadHandle(path, work);

      reads.add(reading);

      try {
        return await reading;
      } finally {
        reads.delete(reading);
      }
    },

    close: async () => {
      isClosed = true;

      await Promise.allSettled(reads);
      await handles.disposeAsync();
    },
  };
}

interface HandleOptions {
  // false fails on a missing file, where true would make an empty one with no tables
  readonly create: boolean;
  readonly busyTimeoutMs: number;
}

function openStoreHandle(path: string, options: HandleOptions): Database {
  const handle = new Database(path, { readwrite: true, create: options.create });

  handle.run('PRAGMA journal_mode = WAL');
  handle.run('PRAGMA synchronous = NORMAL');
  handle.run(`PRAGMA busy_timeout = ${options.busyTimeoutMs}`);

  return handle;
}

// A handle of its own per call, so a read sees the last commit and never a running exclusive
// call's writes, and a read started inside another read never waits for the outer one's handle.
async function withReadHandle<T>(
  path: string,
  work: (reader: StoreReader) => Promise<T>,
): Promise<T> {
  await using opened = new AsyncDisposableStack();

  const handle = openStoreHandle(path, { create: false, busyTimeoutMs: 5000 });

  opened.defer(() => {
    handle.close();
  });

  const readerDB = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(handle) });

  opened.defer(() => readerDB.destroy());

  return await readerDB.connection().execute((db) =>
    withTransaction(
      db,
      (connection) => sql`BEGIN`.execute(connection),
      () => work(buildSQLiteReader(db)),
    ),
  );
}
