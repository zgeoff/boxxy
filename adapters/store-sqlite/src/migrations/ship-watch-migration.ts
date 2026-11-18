import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// The ship watch's row for each item and merge commit, and the phase column of a notify notice.
// An earlier notice has no phase, so its column stays null.
const statements = [
  sql`CREATE TABLE item_shipped (
    item_id TEXT NOT NULL,
    "commit" TEXT NOT NULL,
    rule TEXT NOT NULL,
    ref TEXT NOT NULL,
    release TEXT,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, "commit")
  ) STRICT`,
  sql`ALTER TABLE notices ADD COLUMN phase TEXT`,
];

export const shipWatchMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
