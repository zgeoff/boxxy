import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// a STRICT table refuses a value of the wrong type, so a bad write fails at the store
const statements = [
  sql`CREATE TABLE items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    repo TEXT NOT NULL,
    title TEXT NOT NULL,
    outcome TEXT NOT NULL,
    acceptance TEXT NOT NULL,
    found_in_attempt TEXT,
    filed_by TEXT NOT NULL,
    filed_at INTEGER NOT NULL,
    closed_at INTEGER,
    close_reason TEXT
  ) STRICT`,
  sql`CREATE TABLE links (
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    type TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    removed_at INTEGER,
    PRIMARY KEY (source, target, type, added_at)
  ) STRICT`,
  sql`CREATE UNIQUE INDEX links_live ON links (source, target, type) WHERE removed_at IS NULL`,
  sql`CREATE TABLE levers (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    item TEXT NOT NULL,
    until INTEGER,
    expires_at INTEGER,
    reason TEXT,
    actor TEXT NOT NULL,
    at INTEGER NOT NULL
  ) STRICT`,
  sql`CREATE INDEX levers_item_kind ON levers (item, kind)`,
  sql`CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    item TEXT NOT NULL,
    phase TEXT NOT NULL,
    number INTEGER NOT NULL,
    runner TEXT NOT NULL,
    recipe_hash TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    pool TEXT NOT NULL,
    slot INTEGER NOT NULL,
    slot_gen INTEGER NOT NULL,
    lease_gen INTEGER NOT NULL,
    spawn_request TEXT NOT NULL,
    spawn_request_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    failure TEXT,
    atc_session TEXT,
    close_out TEXT,
    claimed_at INTEGER NOT NULL,
    started_at INTEGER,
    ended_at INTEGER,
    UNIQUE (item, phase, number)
  ) STRICT`,
  sql`CREATE INDEX attempts_atc_session ON attempts (atc_session)`,
  sql`CREATE TABLE attempt_sessions (
    attempt TEXT NOT NULL,
    agent_session TEXT NOT NULL UNIQUE,
    atc_session TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (attempt, agent_session)
  ) STRICT`,
  sql`CREATE TABLE leases (
    item TEXT NOT NULL,
    phase TEXT NOT NULL,
    attempt TEXT NOT NULL,
    gen INTEGER NOT NULL,
    taken_at INTEGER NOT NULL,
    released_at INTEGER,
    PRIMARY KEY (item, phase, gen)
  ) STRICT`,
  sql`CREATE UNIQUE INDEX leases_live ON leases (item, phase) WHERE released_at IS NULL`,
  sql`CREATE TABLE pool_slots (
    pool TEXT NOT NULL,
    slot INTEGER NOT NULL,
    holder TEXT,
    gen INTEGER NOT NULL,
    retired INTEGER NOT NULL,
    PRIMARY KEY (pool, slot)
  ) STRICT`,
  sql`CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    attempt TEXT NOT NULL,
    item TEXT NOT NULL,
    pool TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    store_version INTEGER NOT NULL,
    pepys_offsets TEXT NOT NULL,
    faults TEXT NOT NULL,
    at INTEGER NOT NULL
  ) STRICT`,
  sql`CREATE TABLE evidence (
    fact_id TEXT PRIMARY KEY,
    attempt TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    observed TEXT,
    source TEXT NOT NULL,
    at INTEGER NOT NULL,
    UNIQUE (attempt, kind, ref)
  ) STRICT`,
  sql`CREATE TABLE pull_requests (
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    attempt TEXT NOT NULL,
    state TEXT NOT NULL,
    merged_at INTEGER,
    merge_commit TEXT,
    checked_at INTEGER NOT NULL,
    PRIMARY KEY (repo, number)
  ) STRICT`,
  sql`CREATE TABLE runners (
    id TEXT PRIMARY KEY,
    heartbeat_at INTEGER NOT NULL,
    paused INTEGER NOT NULL
  ) STRICT`,
  sql`CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    fact_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    entity TEXT NOT NULL,
    actor TEXT NOT NULL,
    at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    sent_at INTEGER
  ) STRICT`,
  sql`CREATE INDEX outbox_unsent ON outbox (seq) WHERE sent_at IS NULL`,
];

export const createTablesMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
