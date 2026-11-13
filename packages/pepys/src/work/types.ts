// The facts the fold reads, in the shape that the kit's glue gives the consumer, so the glue's fact
// union fits `WorkFact`. The glue types an `exactOptional` field of the model as `unknown`, so
// those fields are `unknown` here and the fold narrows them.

interface CallerFields {
  issuer: string;
  subject: string;
}

interface FactBase {
  id: string;
  entity: string;
  at: string;
}

export interface ItemFiledFact extends FactBase {
  type: 'boxxy.item.filed';
  payload: { kind: string; repo: string; title: string; fields: { designMode?: unknown } };
}

export interface ItemEditedFact extends FactBase {
  type: 'boxxy.item.edited';
  payload: { title?: unknown; kind?: unknown; fields?: unknown };
}

export interface ItemClosedFact extends FactBase {
  type: 'boxxy.item.closed';
  payload: { reason: string };
}

export interface AttemptClaimedFact extends FactBase {
  type: 'boxxy.attempt.claimed';
  payload: {
    attempt: string;
    phase: string;
    number: number;
    round: number;
    mode: string;
    pool: string;
    recipeHash: string;
    rulesVersion: string;
  };
}

// `started`, `reconciled` and `resumed`: the facts that carry the attempt's atc session and caller
export interface AttemptSessionFact extends FactBase {
  type: 'boxxy.attempt.started' | 'boxxy.attempt.reconciled' | 'boxxy.attempt.resumed';
  payload: { attempt: string; atcSession: string; caller: CallerFields | null };
}

interface SessionBoundFact extends FactBase {
  type: 'boxxy.attempt.session_bound';
  payload: { attempt: string; atcSession: string; agentSession: string; product: string };
}

// `slept` and `woken`: the fold reads the attempt and the time
interface AttemptMarkFact extends FactBase {
  type: 'boxxy.attempt.slept' | 'boxxy.attempt.woken';
  payload: { attempt: string };
}

// The glue types the close-out as `unknown`, so the fold narrows it to a review's
// `unrelatedLines`.
export interface AttemptClosedOutFact extends FactBase {
  type: 'boxxy.attempt.closed_out';
  payload: { attempt: string; closeOut?: unknown };
}

export interface AttemptSettledFact extends FactBase {
  type: 'boxxy.attempt.settled';
  payload: {
    attempt: string;
    state: string;
    outcome: string;
    failure: string | null;
    asleep: boolean;
  };
}

interface PullRequestLinkedFact extends FactBase {
  type: 'boxxy.pull_request.linked';
  payload: { attempt: string; pullRequestId: string };
}

// the 14 fact types the fold passes over
export interface PassedOverFact extends FactBase {
  type:
    | 'boxxy.item.noted'
    | 'boxxy.relation.added'
    | 'boxxy.relation.removed'
    | 'boxxy.lever.recorded'
    | 'boxxy.decision.recorded'
    | 'boxxy.attempt.spawn_unanswered'
    | 'boxxy.attempt.wake_requested'
    | 'boxxy.attempt.timed_out'
    | 'boxxy.attempt.turn_ended'
    | 'boxxy.proposal.recorded'
    | 'boxxy.evidence.recorded'
    | 'boxxy.commit.linked'
    | 'boxxy.pull_request.merged'
    | 'boxxy.pull_request.closed'
    | 'boxxy.attempt.job_started'
    | 'boxxy.merge.requested'
    | 'boxxy.merge.answered';
  payload?: unknown;
}

export type WorkFact =
  | ItemFiledFact
  | ItemEditedFact
  | ItemClosedFact
  | AttemptClaimedFact
  | AttemptSessionFact
  | SessionBoundFact
  | AttemptMarkFact
  | AttemptClosedOutFact
  | AttemptSettledFact
  | PullRequestLinkedFact
  | PassedOverFact;

// What the fold gives: the rows of the three tables and the evidence of each link, with bare
// IDs. The entry file turns each bare ID into its entity ID with the glue's builders.

// `boxxy_item` without `id`: the scope is the item
export interface ItemFold {
  kind: string;
  repo: string;
  title: string;
  design_mode: string | null;
  filed_at: string;
  closed_at: string | null;
  close_reason: string | null;
  updated_at: string;
}

export interface SleepStretch {
  from: string;
  to: string | null;
}

// `boxxy_attempt` with the bare attempt ID, and without `item_id`
export interface AttemptFold {
  id: string;
  phase: string;
  number: number;
  round: number;
  mode: string;
  pool: string;
  recipe_hash: string;
  rules_version: string;
  atc_session: string | null;
  state: string;
  outcome: string | null;
  failure: string | null;
  claimed_at: string;
  started_at: string | null;
  closed_out_at: string | null;
  ended_at: string | null;
  unrelated_lines: number | null;
  sleeps: SleepStretch[];
  updated_at: string;

  // the `claimed` fact: the evidence of `attempt_of`
  claimedFact: string;
  sessions: SessionFold[];
  pullRequests: PullRequestFold[];
}

// one `boxxy_attempt_session` row, with the bare session ID, and the evidence of its `ran_in`
export interface SessionFold {
  session: string;
  key: 'atc' | 'agent';
  product: string | null;
  caller_issuer: string | null;
  caller_subject: string | null;
  bound_at: string;
  evidence: string;
}

// one `produced` link: the decimal text of GitHub's ID, and its evidence
export interface PullRequestFold {
  id: string;
  evidence: string;
}

export interface WorkFold {
  item: ItemFold | null;
  attempts: AttemptFold[];
}
