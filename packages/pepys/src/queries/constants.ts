// An attempt that the worker refused for capacity ran no session: it is no attempt of work, and
// neither query counts it.
export const noCapacityFailure = 'no-capacity';

// Outcome names of boxxy's phase kinds. A phase kind that renames one must change this list.
export const outcomeNames = {
  built: 'built',
  passed: 'passed',
  changesRequested: 'changes-requested',
} as const;

// The sessions that an attempt of the item used. Each statement reads plain rows, and the
// builders do the windows, the caller match and the sums, so the statements need no window
// function, no `julianday` and no common table expression from the store.
const itemSessions = `select own.session_id from boxxy_attempt_session as own
  inner join boxxy_attempt as attempt on attempt.id = own.attempt_id
  where attempt.item_id = ?`;

// Each statement takes the item's entity ID as its one parameter.
export const statements = {
  attempts: `select id, phase, number, round, state, outcome, failure, claimed_at, ended_at, sleeps
  from boxxy_attempt where item_id = ? order by number, id`,
  bindings: `select attempt_id, session_id, bound_at, caller_issuer, caller_subject
  from boxxy_attempt_session where session_id in (${itemSessions})`,
  requests: `select session_id, origin_issuer, origin_subject, product, model, cost_basis, cost_usd,
    input_tokens, cache_read_tokens, cache_creation_tokens, output_tokens, at
  from telemetry_model_request where session_id in (${itemSessions})`,
  turns: `select session_id, origin_issuer, origin_subject, product, model, cost_usd, at
  from telemetry_turn_cost where session_id in (${itemSessions})`,
  pullRequests: `select distinct produced.to_id as id, pull_request.merged_at
  from link_effective as produced
  inner join boxxy_attempt as attempt on attempt.id = produced.from_id
  left join github_pull_request as pull_request on pull_request.id = produced.to_id
  where produced.type = 'produced' and attempt.item_id = ?`,
} as const;
