import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// Each attempt stored as `no-capacity` becomes a row that keeps its attempt's ID, and goes with its
// seats, sessions and decisions. Its released lease stays, so a lease generation is never reused.
const refused = sql`SELECT id FROM attempts WHERE failure = 'no-capacity'`;

const statements = [
  sql`CREATE TABLE capacity_refusals (
    id TEXT PRIMARY KEY,
    attempt TEXT NOT NULL,
    item TEXT NOT NULL,
    phase TEXT NOT NULL,
    pool TEXT NOT NULL,
    at INTEGER NOT NULL,
    refusal TEXT
  ) STRICT`,
  sql`CREATE INDEX capacity_refusals_at ON capacity_refusals (at)`,
  sql`INSERT INTO capacity_refusals (id, attempt, item, phase, pool, at, refusal)
    SELECT id, id, item, phase, coalesce(pool, 'unknown'), coalesce(ended_at, claimed_at), refusal
    FROM attempts WHERE failure = 'no-capacity'`,
  sql`DELETE FROM limit_seats WHERE attempt IN (${refused})`,
  sql`DELETE FROM attempt_sessions WHERE attempt IN (${refused})`,
  sql`DELETE FROM decisions WHERE attempt IN (${refused})`,
  sql`DELETE FROM attempts WHERE failure = 'no-capacity'`,
];

export const capacityRefusalsMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
