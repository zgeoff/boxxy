import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// An attempt stored before boxxy kept atc's refusal has no refusal.
export const refusalMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`ALTER TABLE attempts ADD COLUMN refusal TEXT`.execute(db);
  },
};
