import type { AttemptRow } from '../types.ts';
import type { AttemptSummary } from './attempt-summary-schema.ts';

export function toAttemptSummary(row: AttemptRow): AttemptSummary {
  return {
    id: row.id,
    item: row.item,
    phase: row.phase,
    number: row.number,
    round: row.round,
    mode: row.mode,
    state: row.state,
    failure: row.failure,
    refusal: row.refusal,
    pool: row.pool,
    runner: row.runner,
    atcSession: row.atcSession,
    claimedAt: row.claimedAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    outcome: row.outcome,
  };
}
