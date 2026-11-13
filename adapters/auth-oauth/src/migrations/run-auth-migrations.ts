import type { Database } from 'bun:sqlite';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { grantRowsMigration } from './grant-rows-migration.ts';

// Kysely runs the migrations in the order of their names, in one transaction, and skips each one
// the file has run.
const migrations = {
  '0001-grant-rows': grantRowsMigration,
};

// SQLite ignores `PRAGMA foreign_keys` inside a transaction, and with the keys on, a dropped table
// runs its cascades. So the keys go off before the migrations start, and back on once they end.
export async function runAuthMigrations(sqlite: Database): Promise<void> {
  sqlite.run('PRAGMA foreign_keys = OFF;');

  const db = new Kysely<unknown>({ dialect: buildSQLiteDialect(sqlite) });

  try {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: () => Promise.resolve(migrations) },
    });

    const outcome = await migrator.migrateToLatest();

    if (outcome.error !== undefined) {
      throw new Error('the auth database migrations failed', { cause: outcome.error });
    }
  } finally {
    await db.destroy();

    sqlite.run('PRAGMA foreign_keys = ON;');
  }
}
