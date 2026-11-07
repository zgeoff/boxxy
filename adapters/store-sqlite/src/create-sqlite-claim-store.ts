import { Database } from 'bun:sqlite';
import type { ClaimStore } from '@boxxy/model';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely, sql } from 'kysely';
import type { RawBuilder } from 'kysely';
import { buildSQLiteReader } from './build-sqlite-reader.ts';
import { buildSQLiteTx } from './build-sqlite-tx.ts';
import { runStoreMigrations } from './run-store-migrations.ts';
import type { StoreDatabase } from './types.ts';

export interface SQLiteClaimStore extends ClaimStore {
  close: () => Promise<void>;
}

export async function createSQLiteClaimStore(path: string): Promise<SQLiteClaimStore> {
  const writer = openStoreHandle(path);
  const reader = openStoreHandle(path);

  const writerDB = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(writer) });
  const readerDB = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(reader) });

  await runStoreMigrations(writerDB);

  return {
    // Kysely holds the one connection of a handle from acquire to release, so two calls on this
    // store run one at a time, and BEGIN IMMEDIATE makes another process's writer wait.
    exclusive: (work) =>
      writerDB
        .connection()
        .execute((db) => withTransaction(db, sql`BEGIN IMMEDIATE`, () => work(buildSQLiteTx(db)))),

    // a second handle, so a read sees the last commit and never a running exclusive call's writes
    read: (work) =>
      readerDB
        .connection()
        .execute((db) => withTransaction(db, sql`BEGIN`, () => work(buildSQLiteReader(db)))),

    close: async () => {
      await writerDB.destroy();
      await readerDB.destroy();

      reader.close();
      writer.close();
    },
  };
}

function openStoreHandle(path: string): Database {
  const handle = new Database(path, { create: true });

  handle.run('PRAGMA journal_mode = WAL');
  handle.run('PRAGMA synchronous = NORMAL');
  handle.run('PRAGMA busy_timeout = 5000');

  return handle;
}

async function withTransaction<T>(
  db: Kysely<StoreDatabase>,
  begin: RawBuilder<unknown>,
  work: () => Promise<T>,
): Promise<T> {
  await begin.execute(db);

  try {
    const result = await work();

    await sql`COMMIT`.execute(db);

    return result;
  } catch (error) {
    // SQLite ends the transaction by itself after some errors, such as a full disk, and ROLLBACK
    // then fails; its error joins the first one, never replaces it
    await sql`ROLLBACK`.execute(db).catch((rollbackError: unknown) => {
      throw new AggregateError([error, rollbackError], 'the work failed, and so did its rollback', {
        cause: error,
      });
    });

    throw error;
  }
}
