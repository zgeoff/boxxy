import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// A `check` or `verdict` row holds the head the server read. Evidence stored before this has none.
// The column is added in place, never by rebuilding the table, which holds the stored evidence.
export const evidenceHeadMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`ALTER TABLE evidence ADD COLUMN head TEXT`.execute(db);
  },
};
