import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// A row that exists before this migration is due at once, and starts on its first key.
const statements = [
  sql`ALTER TABLE notices ADD COLUMN key_seq INTEGER NOT NULL DEFAULT 0`,
  sql`ALTER TABLE notices ADD COLUMN key_tries INTEGER NOT NULL DEFAULT 0`,
  sql`ALTER TABLE notices ADD COLUMN next_try_at INTEGER NOT NULL DEFAULT 0`,
  sql`UPDATE notices SET next_try_at = at`,
  sql`DROP INDEX notices_unsent`,
  sql`CREATE INDEX notices_unsent ON notices (next_try_at) WHERE sent_at IS NULL`,
];

export const noticeKeysMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
