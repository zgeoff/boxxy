import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// A lever stored before the sign-off levers has no head.
export const leverHeadMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`ALTER TABLE levers ADD COLUMN head TEXT`.execute(db);
  },
};
