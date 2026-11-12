import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// An item stored before the body existed has an empty one.
export const itemBodyMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`ALTER TABLE items ADD COLUMN body TEXT NOT NULL DEFAULT ''`.execute(db);
  },
};
