import type { CloseOut } from '../closeouts/types.ts';
import type { AttemptRow, EngineOutcome } from '../types.ts';
import type { AttemptSummary } from './attempt-summary-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

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
    outcome: toOutcomeName(row),
  };
}

const engineOutcomes: ReadonlySet<string> = new Set<EngineOutcome>([
  'lost',
  'unsettleable',
  'skipped',
]);

// The outcome name that the attempt's close-out chose, or null when it has no close-out. A review
// close-out holds a gate reading and no name, so its name is the one that settling set.
function toOutcomeName(row: AttemptRow): AttemptSummary['outcome'] {
  if (row.closeOut === null) {
    return null;
  }

  const name = toCloseOutName(row.closeOut);

  if (name !== null) {
    return brandSchemas.outcomeName.parse(name);
  }

  return row.outcome === null || engineOutcomes.has(row.outcome)
    ? null
    : brandSchemas.outcomeName.parse(row.outcome);
}

function toCloseOutName(closeOut: CloseOut): string | null {
  if ('result' in closeOut) {
    return closeOut.result.kind;
  }

  if ('outcome' in closeOut) {
    return closeOut.outcome;
  }

  return null;
}
