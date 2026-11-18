import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// The runner row gains who paused it, when and why, and when its notice was queued. The notices
// table gains a kind and the paused-runner detail, and its item and reason may be null, which
// SQLite changes only by rebuilding the table. Each stored notice is a hold notice.
const statements = [
  sql`ALTER TABLE runners ADD COLUMN paused_at INTEGER`,
  sql`ALTER TABLE runners ADD COLUMN paused_by TEXT`,
  sql`ALTER TABLE runners ADD COLUMN pause_reason TEXT`,
  sql`ALTER TABLE runners ADD COLUMN pause_noticed_at INTEGER`,
  sql`CREATE TABLE notices_next (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT,
    reason TEXT,
    at INTEGER NOT NULL,
    tries INTEGER NOT NULL,
    sent_at INTEGER,
    key_seq INTEGER NOT NULL DEFAULT 0,
    key_tries INTEGER NOT NULL DEFAULT 0,
    next_try_at INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    pause TEXT
  ) STRICT`,
  sql`INSERT INTO notices_next
    (id, item, reason, at, tries, sent_at, key_seq, key_tries, next_try_at, kind)
    SELECT id, item, reason, at, tries, sent_at, key_seq, key_tries, next_try_at, 'hold'
    FROM notices`,
  sql`DROP TABLE notices`,
  sql`ALTER TABLE notices_next RENAME TO notices`,
  sql`CREATE INDEX notices_unsent ON notices (next_try_at) WHERE sent_at IS NULL`,
];

export const runnerPauseMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
