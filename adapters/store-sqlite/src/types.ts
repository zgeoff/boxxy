import type { Generated } from 'kysely';

export interface StoreDatabase {
  items: {
    id: string;
    kind: string;
    repo: string;
    title: string;
    outcome: string;
    acceptance: string;
    found_in_attempt: string | null;
    filed_by: string;
    filed_at: number;
    closed_at: number | null;
    close_reason: string | null;
  };
  relations: {
    source: string;
    target: string;
    type: string;
    added_by: string;
    added_at: number;
    removed_at: number | null;
  };
  levers: {
    seq: number;
    kind: string;
    item: string;
    until: number | null;
    expires_at: number | null;
    reason: string | null;
    actor: string;
    at: number;
  };
  attempts: {
    id: string;
    item: string;
    phase: string;
    number: number;
    runner: string;
    recipe_hash: string;
    rules_version: string;
    pool: string;
    slot: number;
    slot_gen: number;
    lease_gen: number;
    spawn_request: string;
    spawn_request_hash: string;
    state: string;
    failure: string | null;
    atc_session: string | null;
    close_out: string | null;
    claimed_at: number;
    started_at: number | null;
    ended_at: number | null;
  };
  attempt_sessions: {
    attempt: string;
    agent_session: string;
    atc_session: string;
    seen_at: number;
  };
  leases: {
    item: string;
    phase: string;
    attempt: string;
    gen: number;
    taken_at: number;
    released_at: number | null;
  };
  pool_slots: {
    pool: string;
    slot: number;
    holder: string | null;
    gen: number;
    retired: number;
  };
  decisions: {
    id: string;
    attempt: string;
    item: string;
    pool: string;
    rules_version: string;
    snapshot_hash: string;
    store_version: number;
    pepys_offsets: string;
    faults: string;
    at: number;
  };
  evidence: {
    fact_id: string;
    attempt: string;
    kind: string;
    ref: string;
    observed: string | null;
    source: string;
    at: number;
  };
  pull_requests: {
    repo: string;
    number: number;
    attempt: string;
    state: string;
    merged_at: number | null;
    merge_commit: string | null;
    checked_at: number;
  };
  runners: {
    id: string;
    heartbeat_at: number;
    paused: number;
  };
  outbox: {
    seq: Generated<number>;
    fact_id: string;
    type: string;
    entity: string;
    actor: string;
    at: number;
    payload: string;
    sent_at: number | null;
  };
}
