import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { lockWaitLimitMs } from '../constants.ts';
import type { StoreDatabase } from '../types.ts';
import { withTransaction } from '../with-transaction.ts';
import { takeWriteLock } from '../writes/take-write-lock.ts';
import { createTablesMigration } from './create-tables-migration.ts';
import { itemBodyMigration } from './item-body-migration.ts';
import { jobAttemptsMigration } from './job-attempts-migration.ts';
import { noticeKeysMigration } from './notice-keys-migration.ts';
import { renameRelationsMigration } from './rename-relations-migration.ts';
import { v1TablesMigration } from './v1-tables-migration.ts';

// Kysely's SQLite migration lock does nothing, so two openers of a new file would both find nothing
// run; the write lock makes the second one wait and then find the file migrated.
export async function runStoreMigrations(db: Kysely<StoreDatabase>): Promise<void> {
  await db.connection().execute((connection) =>
    withTransaction(
      connection,
      (locked) => takeWriteLock(locked, lockWaitLimitMs),
      () => runMigrator(connection),
    ),
  );
}

// Kysely runs the migrations in the order of their names, and skips each one the file has run.
const migrations = {
  '0001-create-tables': createTablesMigration,
  '0002-rename-relations': renameRelationsMigration,
  '0003-v1-tables': v1TablesMigration,
  '0004-notice-keys': noticeKeysMigration,
  '0005-item-body': itemBodyMigration,
  '0006-job-attempts': jobAttemptsMigration,
};

async function runMigrator(db: Kysely<StoreDatabase>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
    disableTransactions: true,
  });

  const outcome = await migrator.migrateToLatest();

  if (outcome.error !== undefined) {
    throw new Error('the store migrations failed', { cause: outcome.error });
  }
}
