import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// Every attempt stored before job workers existed ran on the atc worker.
const statements = [
  sql`ALTER TABLE attempts ADD COLUMN worker TEXT NOT NULL DEFAULT 'atc.session'`,
  sql`ALTER TABLE attempts ADD COLUMN acted_at INTEGER`,
  sql`ALTER TABLE attempts ADD COLUMN acted_head TEXT`,
  sql`ALTER TABLE attempts ADD COLUMN acted_answer TEXT`,
  sql`ALTER TABLE attempts ADD COLUMN read_at INTEGER`,
  sql`ALTER TABLE attempts ADD COLUMN wait_reason TEXT`,
];

export const jobAttemptsMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
