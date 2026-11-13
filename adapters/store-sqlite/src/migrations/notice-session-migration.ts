import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// The check on `id` keeps the table to one row.
export const noticeSessionMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`CREATE TABLE notice_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      gateway_id TEXT NOT NULL,
      set_at INTEGER NOT NULL
    ) STRICT`.execute(db);
  },
};
