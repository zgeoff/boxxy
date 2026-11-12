import type { Generated } from 'kysely';

export interface StoreDatabase {
  items: {
    id: string;
    kind: string;
    repo: string;
    title: string;
    outcome: string;
    acceptance: string;
    fields: string;
    labels: string;
    found_in_attempt: string | null;
    filed_by: string;
    filed_at: number;
    closed_at: number | null;
    close_reason: string | null;
    kept_session: string | null;
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
    phase: string | null;
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
    lease_gen: number;
    spawn_request: string;
    spawn_request_hash: string;
    state: string;
    failure: string | null;
    atc_session: string | null;
    caller: string | null;
    claimed_at: number;
    started_at: number | null;
    ended_at: number | null;
    fields: string;
    mode: string;
    round: number;
    input: string | null;
    hold_gen: number;
    close_out: string | null;
    close_out_hash: string | null;
    close_out_fact: string | null;
    closing: string | null;
    closing_at: number | null;
    suspend_requested_at: number | null;
    slept_at: number | null;
    wake_requested_at: number | null;
    woken_at: number | null;
    outcome: string | null;
    returned_outcome: string | null;
    strayed_at: number | null;
    session_stopped_at: number | null;
    session_forgotten_at: number | null;
    worker: string;
    acted_at: number | null;
    acted_head: string | null;
    acted_answer: string | null;
    read_at: number | null;
    wait_reason: string | null;
  };
  attempt_sessions: {
    attempt: string;
    agent_session: string;
    atc_session: string;
    product: string;
    source: string;
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
  limits: {
    name: string;
    max: number;
    counts: string;
  };
  limit_seats: {
    limit: string;
    attempt: string;
    hold_gen: number;
    over_cap: number;
    taken_at: number;
    released_at: number | null;
  };
  decisions: {
    id: string;
    attempt: string;
    item: string;
    kind: string;
    pool: string;
    rules_version: string;
    snapshot_hash: string;
    store_version: number;
    pepys_offsets: string;
    faults: string;
    limits: string;
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
    github_id: number;
    url: string;
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
  notes: {
    item: string;
    seq: number;
    text: string;
    by: string;
    at: number;
  };
  notices: {
    id: Generated<number>;
    item: string;
    reason: string;
    at: number;
    tries: number;
    sent_at: number | null;
    key_seq: number;
    key_tries: number;
    next_try_at: number;
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
    parked_at: number | null;
    parked_reason: string | null;
  };
}
