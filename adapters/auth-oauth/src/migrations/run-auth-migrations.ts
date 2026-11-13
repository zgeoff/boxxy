import type { Database } from 'bun:sqlite';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely, sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { grantRowsMigration } from './grant-rows-migration.ts';

// Kysely's SQLite adapter reports no transactional DDL, so its Migrator opens no transaction; the
// runner opens one itself, around every migration and its record. SQLite ignores the foreign_keys
// pragma inside a transaction, so the keys go off before it, since a dropped table runs cascades.
export async function runAuthMigrations(sqlite: Database): Promise<void> {
  sqlite.run('PRAGMA foreign_keys = OFF;');

  const db = new Kysely<unknown>({ dialect: buildSQLiteDialect(sqlite) });

  try {
    await db.connection().execute(async (connection) => {
      await sql`BEGIN IMMEDIATE`.execute(connection);

      try {
        await runMigrator(connection);

        await sql`COMMIT`.execute(connection);
      } catch (error) {
        await sql`ROLLBACK`.execute(connection);

        throw error;
      }
    });
  } finally {
    await db.destroy();

    sqlite.run('PRAGMA foreign_keys = ON;');
  }
}

// Kysely runs the migrations in the order of their names, and skips each one the file has run.
const migrations = {
  '0001-grant-rows': grantRowsMigration,
};

async function runMigrator(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
    disableTransactions: true,
  });

  const outcome = await migrator.migrateToLatest();

  if (outcome.error !== undefined) {
    throw new Error('the auth database migrations failed', { cause: outcome.error });
  }
}
