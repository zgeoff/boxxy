import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// A spawn that atc refused for capacity leaves one row here, and no attempt. Each attempt stored
// as `no-capacity` becomes a row that keeps its attempt's ID, and the attempt goes with every row
// that belongs only to it. pepys already holds their facts.
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
  sql`DELETE FROM leases WHERE attempt IN (${refused})`,
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
