import { Database } from 'bun:sqlite';
import type { ClaimStore } from '@boxxy/model';
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

  const writer = openStoreHandle(path, 0);

  opened.defer(() => {
    writer.close();
  });

  const reader = openStoreHandle(path, 5000);

  opened.defer(() => {
    reader.close();
  });

  const writerDB = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(writer) });
  const readerDB = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(reader) });

  opened.defer(() => readerDB.destroy());
  opened.defer(() => writerDB.destroy());

  await runStoreMigrations(writerDB);

  const handles = opened.move();

  return {
    // Kysely holds the one connection of a handle from acquire to release, so two calls on this
    // store run one at a time, and the write lock makes another store's writer wait.
    exclusive: (work) =>
      writerDB
        .connection()
        .execute((db) => withTransaction(db, takeWriteLock, () => work(createSQLiteTx(db)))),

    // a second handle, so a read sees the last commit and never a running exclusive call's writes
    read: (work) =>
      readerDB.connection().execute((db) =>
        withTransaction(
          db,
          (connection) => sql`BEGIN`.execute(connection),
          () => work(buildSQLiteReader(db)),
        ),
      ),

    close: () => handles.disposeAsync(),
  };
}

function openStoreHandle(path: string, busyTimeoutMs: number): Database {
  const handle = new Database(path, { create: true });

  handle.run('PRAGMA journal_mode = WAL');
  handle.run('PRAGMA synchronous = NORMAL');
  handle.run(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  return handle;
}
