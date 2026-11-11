import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// Slice 1 never ran outside tests, so this rebuilds each changed table empty, in place of ALTER
// statements that would need an invented default for every new NOT NULL column. A file that
// already holds an item or a fact is refused, so no row is ever dropped.
const statements = [
  sql`DROP TABLE items`,
  sql`CREATE TABLE items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    repo TEXT NOT NULL,
    title TEXT NOT NULL,
    outcome TEXT NOT NULL,
    acceptance TEXT NOT NULL,
    fields TEXT NOT NULL,
    labels TEXT NOT NULL,
    found_in_attempt TEXT,
    filed_by TEXT NOT NULL,
    filed_at INTEGER NOT NULL,
    closed_at INTEGER,
    close_reason TEXT,
    kept_session TEXT
  ) STRICT`,
  sql`DROP TABLE levers`,
  sql`CREATE TABLE levers (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    item TEXT NOT NULL,
    until INTEGER,
    expires_at INTEGER,
    reason TEXT,
    phase TEXT,
    actor TEXT NOT NULL,
    at INTEGER NOT NULL
  ) STRICT`,
  sql`CREATE INDEX levers_item_kind ON levers (item, kind)`,
  sql`DROP TABLE attempts`,
  sql`CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    item TEXT NOT NULL,
    phase TEXT NOT NULL,
    number INTEGER NOT NULL,
    runner TEXT NOT NULL,
    recipe_hash TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    pool TEXT NOT NULL,
    lease_gen INTEGER NOT NULL,
    spawn_request TEXT NOT NULL,
    spawn_request_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    failure TEXT,
    atc_session TEXT,
    caller TEXT,
    claimed_at INTEGER NOT NULL,
    started_at INTEGER,
    ended_at INTEGER,
    fields TEXT NOT NULL,
    mode TEXT NOT NULL,
    round INTEGER NOT NULL,
    input TEXT,
    hold_gen INTEGER NOT NULL,
    close_out TEXT,
    close_out_hash TEXT,
    close_out_fact TEXT,
    closing TEXT,
    closing_at INTEGER,
    suspend_requested_at INTEGER,
    slept_at INTEGER,
    wake_requested_at INTEGER,
    woken_at INTEGER,
    outcome TEXT,
    returned_outcome TEXT,
    strayed_at INTEGER,
    session_stopped_at INTEGER,
    session_forgotten_at INTEGER,
    UNIQUE (item, phase, number)
  ) STRICT`,
  sql`CREATE INDEX attempts_atc_session ON attempts (atc_session)`,
  sql`DROP TABLE attempt_sessions`,

  // a kept session binds one agent session to each later attempt, so the agent session is no key
  sql`CREATE TABLE attempt_sessions (
    attempt TEXT NOT NULL,
    agent_session TEXT NOT NULL,
    atc_session TEXT NOT NULL,
    product TEXT NOT NULL,
    source TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (attempt, agent_session)
  ) STRICT`,
  sql`CREATE INDEX attempt_sessions_agent_session ON attempt_sessions (agent_session)`,
  sql`DROP TABLE pool_slots`,
  sql`CREATE TABLE limits (
    name TEXT PRIMARY KEY,
    max INTEGER NOT NULL,
    counts TEXT NOT NULL
  ) STRICT`,
  sql`CREATE TABLE limit_seats (
    "limit" TEXT NOT NULL,
    attempt TEXT NOT NULL,
    hold_gen INTEGER NOT NULL,
    over_cap INTEGER NOT NULL,
    taken_at INTEGER NOT NULL,
    released_at INTEGER
  ) STRICT`,
  sql`CREATE UNIQUE INDEX limit_seats_held ON limit_seats ("limit", attempt, hold_gen)
    WHERE released_at IS NULL`,
  sql`DROP TABLE decisions`,
  sql`CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    attempt TEXT NOT NULL,
    item TEXT NOT NULL,
    kind TEXT NOT NULL,
    pool TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    store_version INTEGER NOT NULL,
    pepys_offsets TEXT NOT NULL,
    faults TEXT NOT NULL,
    limits TEXT NOT NULL,
    at INTEGER NOT NULL
  ) STRICT`,
  sql`DROP TABLE pull_requests`,
  sql`CREATE TABLE pull_requests (
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    attempt TEXT NOT NULL,
    github_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    state TEXT NOT NULL,
    merged_at INTEGER,
    merge_commit TEXT,
    checked_at INTEGER NOT NULL,
    PRIMARY KEY (repo, number)
  ) STRICT`,
  sql`CREATE TABLE notes (
    item TEXT NOT NULL,
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    "by" TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (item, seq)
  ) STRICT`,
  sql`CREATE TABLE notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT NOT NULL,
    reason TEXT NOT NULL,
    at INTEGER NOT NULL,
    tries INTEGER NOT NULL,
    sent_at INTEGER
  ) STRICT`,
  sql`CREATE INDEX notices_unsent ON notices (id) WHERE sent_at IS NULL`,
  sql`DROP TABLE outbox`,
  sql`CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    fact_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    entity TEXT NOT NULL,
    actor TEXT NOT NULL,
    at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    sent_at INTEGER,
    parked_at INTEGER,
    parked_reason TEXT
  ) STRICT`,
  sql`CREATE INDEX outbox_unsent ON outbox (seq) WHERE sent_at IS NULL AND parked_at IS NULL`,
  sql`CREATE INDEX outbox_behind ON outbox (entity) WHERE sent_at IS NULL`,
];

export const v1TablesMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    const found = await sql`SELECT 1 FROM items UNION ALL SELECT 1 FROM outbox LIMIT 1`.execute(db);

    if (found.rows.length > 0) {
      throw new Error('the store holds slice 1 rows, which the v1 tables cannot take');
    }

    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
