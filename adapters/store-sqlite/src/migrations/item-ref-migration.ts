import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// An item stored before the short reference existed gets the numbers 1 to N in filing order. The
// column is added in place, never by rebuilding the table, which holds the stored items. A new
// item takes its number from the insert, so the column is never null after this migration.
export const itemRefMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`ALTER TABLE items ADD COLUMN ref INTEGER`.execute(db);

    await sql`UPDATE items SET ref = (
      SELECT ranked.number
      FROM (SELECT id, row_number() OVER (ORDER BY filed_at, id) AS number FROM items) AS ranked
      WHERE ranked.id = items.id
    )`.execute(db);

    await sql`CREATE UNIQUE INDEX items_ref ON items (ref)`.execute(db);
  },
};
