import { Database } from 'bun:sqlite';
import type { ClaimStore, StoreReader } from '@boxxy/model';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely, sql } from 'kysely';
import { lockWaitLimitMs } from './constants.ts';
import { runStoreMigrations } from './migrations/run-store-migrations.ts';
import { buildSQLiteReader } from './reads/build-sqlite-reader.ts';
import type { StoreDatabase } from './types.ts';
import { withBusyRetry } from './with-busy-retry.ts';
import { withTransaction } from './with-transaction.ts';
import { writeHandleSettings } from './write-handle-settings.ts';
import { createSQLiteTx } from './writes/create-sqlite-tx.ts';
import { takeWriteLock } from './writes/take-write-lock.ts';

export interface SQLiteClaimStore extends ClaimStore {
  close: () => Promise<void>;
}

export async function createSQLiteClaimStore(path: string): Promise<SQLiteClaimStore> {
  await using opened = new AsyncDisposableStack();

  const writer = new Database(path, { readwrite: true, create: true });

  opened.defer(() => {
    writer.close();
  });

  writeHandleSettings(writer, 0);

  // The file keeps its journal mode, so a read handle never sets it. SQLite fails these at once,
  // whatever the busy timeout, while another handle switches the file to WAL or recovers it.
  await withBusyRetry(lockWaitLimitMs, () => {
    writer.run('PRAGMA journal_mode = WAL');
    writer.run('PRAGMA synchronous = NORMAL');
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
      Promise.try(() => {
        if (isClosed) {
          throw new Error('the store is closed');
        }

        return writerDB.connection().execute((db) =>
          withTransaction(
            db,
            (locked) => takeWriteLock(locked, lockWaitLimitMs),
            () => work(createSQLiteTx(db)),
          ),
        );
      }),

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

// A handle of its own per call, so a read sees the last commit and never a running exclusive
// call's writes, and a read started inside another read never waits for the outer one's handle.
async function withReadHandle<T>(
  path: string,
  work: (reader: StoreReader) => Promise<T>,
): Promise<T> {
  await using opened = new AsyncDisposableStack();

  // without create, a missing file fails the open, where the default makes an empty file
  const handle = new Database(path, { readwrite: true, create: false });

  opened.defer(() => {
    handle.close();
  });

  writeHandleSettings(handle, lockWaitLimitMs);

  handle.run('PRAGMA synchronous = NORMAL');

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
