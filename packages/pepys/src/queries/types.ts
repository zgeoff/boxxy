// The rows the statements of the two queries read. Each holds the columns of its table that the
// builders need, under the column names.

export interface AttemptReadRow {
  id: string;
  phase: string;
  number: number;
  round: number;
  state: string;
  outcome: string | null;
  failure: string | null;
  claimed_at: string;
  ended_at: string | null;

  // a JSON column: the list of sleep stretches, as text or as the parsed list
  sleeps: unknown;
}

// A row of `boxxy_attempt_session` for every session that an attempt of the item used, with the
// rows of the other attempts, of any item, that used the same session.
export interface BindingReadRow {
  attempt_id: string;
  session_id: string;
  bound_at: string;
  caller_issuer: string | null;
  caller_subject: string | null;
}

// the proven sender of a telemetry row, and its session and time
interface TelemetryReadRow {
  session_id: string;
  origin_issuer: string | null;
  origin_subject: string | null;
  product: string;
  at: string;
}

export interface RequestReadRow extends TelemetryReadRow {
  model: string;
  cost_basis: string;
  cost_usd: number | null;
  input_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  output_tokens: number;
}

export interface TurnReadRow extends TelemetryReadRow {
  model: string | null;
  cost_usd: number;
}

// one pull request that an attempt of the item produced
export interface PullRequestReadRow {
  id: string;
  merged_at: string | null;
}

// One pull request of the item with its delivery times, as the GitHub plug-in's delivery module
// gives them. Two attempts that produced one pull request give two equal rows.
export interface DeliveryReadRow {
  pullRequest: string;
  mergedAt: string | null;
  release: { at: string } | null;
  deploy: { at: string } | null;
}
