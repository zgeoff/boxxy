import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import type { StoreDatabase } from '../types.ts';
import { createTablesMigration } from './create-tables-migration.ts';

// Kysely runs the migrations in the order of their names, and skips each one the file has run.
const migrations = { '0001-create-tables': createTablesMigration };

export async function runStoreMigrations(db: Kysely<StoreDatabase>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });

  const outcome = await migrator.migrateToLatest();

  if (outcome.error !== undefined) {
    throw new Error('the store migrations failed', { cause: outcome.error });
  }
}
