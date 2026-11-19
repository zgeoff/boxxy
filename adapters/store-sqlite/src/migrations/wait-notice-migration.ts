import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// One row for each item and stay at a step that waits, written with the wait notice of that stay.
const statements = [
  sql`CREATE TABLE wait_notices (
    item_id TEXT NOT NULL,
    since INTEGER NOT NULL,
    noticed_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, since)
  ) STRICT`,
];

export const waitNoticeMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
