// Design sketch. It is not compiled.
//
// 02-types.ts: the types of the review gate, the verifier, the job worker and the merge step.
// No bodies. Each section header names the package that owns the types. No type here names a
// review tool, a verify tool or GitHub: only the adapters do.

import type { AttemptId, AttemptRow, CommitSha, Instant, JsonValue, PullRequestRef, RepoName, WorkerKind, WorkerKindName } from '@boxxy/model';

// ── libs/model/src/ports/types.ts: the review gate ─────────────────────────────────────────────

// Why a round runs. The core picks it from the item's settled attempts (03-flow.ts, section C);
// the adapter maps it to its own calls.
//   first    the first review of the build's pull request
//   rework   the review after a build that a `changes-requested` review sent back
//   recheck  the review after a repair, a moved head, a failed verify or a failed review
// Every review after the first checks the builder's answers and raises no new finding.
export type RoundCause = 'first' | 'rework' | 'recheck';

export interface GateRound {
  readonly attempt: AttemptId; // the review attempt
  readonly pullRequest: PullRequestRef;
  readonly round: number; // 1 to 4; counted by the core, never by the adapter
  readonly cause: RoundCause;
}

// The review runs in an agent session on an agent host; the server only checks and posts.
export interface ReviewGate {
  // Pure. The command line that the review session runs on the agent host, in the pull
  // request's checkout. It prints the tool's result, which the session sends as its close-out.
  buildCommand: (round: GateRound) => string;
  // Runs in the server when the review session closes out with that result. It checks the result
  // against the pull request's current head, posts it to the pull request, and reads every
  // finding's state. Throws only when the forge gives no answer; the session then sends again.
  accept: (round: GateRound, result: JsonValue) => Promise<GateReading>;
}

// A reading always names the head it covers. `not-covered`: the result is for another head than
// the pull request's current head, or it read no part of that head. A tool check that passes at
// a head no review read is `not-covered`, never `passed`.
export type GateReading =
  | ({ readonly status: 'passed' } & GateRun)
  | ({ readonly status: 'blocked'; readonly why: 'open-findings' | 'failed-call' | 'unreadable' } & GateRun)
  | { readonly status: 'not-covered'; readonly head: CommitSha; readonly cost: GateCost };

export interface GateRun {
  readonly head: CommitSha;
  readonly open: SeverityCounts; // the findings still open at `head`, whatever round raised them
  readonly closedWithoutFix: number; // findings closed by an answer that is not a confirmed fix
  readonly findingPaths: readonly string[]; // the files of the findings still open at `head`
  readonly cost: GateCost;
  readonly ref: string; // the tool's own ID of the run, for the owner to look up
  readonly answerHint: string; // text for the builder's input: where the findings are and how to answer
}

export interface SeverityCounts { readonly high: number; readonly medium: number; readonly low: number }

// Tokens per model, as the tool reports them. boxxy stores no money; pepys prices the tokens.
export interface GateCost {
  readonly calls: readonly { readonly model: string; readonly input: number; readonly cachedInput: number; readonly cacheWrite: number; readonly output: number; readonly durationMs: number }[];
}

// ── libs/model/src/ports/types.ts: the verifier ────────────────────────────────────────────────

// What the core reads about the grading at a head. The grading itself is an agent's work in the
// `verify` phase. The scope is the tool's: the features whose paths the pull request changed.
export interface Verifier {
  readAt: (pullRequest: PullRequestRef, head: CommitSha) => Promise<VerifyReading>;
}

export type VerifyReading =
  | { readonly status: 'verified' | 'incomplete'; readonly head: CommitSha; readonly features: readonly VerifiedFeature[] }
  // no finished gate run at `head`, or no report in the pull request
  | { readonly status: 'not-covered'; readonly head: CommitSha };

export interface VerifiedFeature {
  readonly name: string;
  readonly status: 'verified' | 'stale' | 'missing' | 'unchanged';
}

// ── libs/model/src/ports/types.ts: the job worker ──────────────────────────────────────────────

// The second worker shape, beside the session-shaped `WorkerKind`. A job runs a phase with no
// agent session and no host: the merge. It has no sleep, wake, kept session or forget. It starts
// nothing: the first read moves the attempt from `claimed` to `running`. The runner records the
// result that the phase kind's `drive` gives as the attempt's close-out, and the attempt settles
// by the normal path.
export interface JobWorker {
  // Throws when the outside system gives no answer, as `WorkerKind.reconcile` does.
  read: (attempt: AttemptRow) => Promise<JobReading>;
  // The one effect that the phase kind's `drive` chose. The merge is the only action.
  act: (attempt: AttemptRow, action: JobAction) => Promise<JobActAnswer>;
}

export type JobReading = { readonly kind: 'running'; readonly observed: JsonValue }; // what the drive reads, such as a MergeObservation

export type JobAction = { readonly kind: 'merge'; readonly unit: MergeUnit; readonly method: MergeMethod; readonly required: readonly string[] }; // `required`: the union the drive read, for `boxxy.merge.requested`
export type JobActAnswer = MergeAnswer | { readonly kind: 'unknown'; readonly reason: string };

// Built in apps/server. A phase kind's `worker` names an entry; the loader refuses a name the map
// lacks, as it refuses an unknown phase.
export type WorkerShape = { readonly shape: 'session'; readonly worker: WorkerKind } | { readonly shape: 'job'; readonly worker: JobWorker };
export type WorkerRegistry = ReadonlyMap<WorkerKindName, WorkerShape>; // replaces `TickDeps.worker`

// ── libs/model/src/rules/types.ts: what the rules gain ─────────────────────────────────────────

export interface PhaseKind {
  // ...the fields it has, and:
  // A phase kind with a job worker gives `drive`: pure, called on each read of a running job.
  readonly drive?: (ctx: { readonly observed: JsonValue; readonly attempt: AttemptRow; readonly deadlinePassed: boolean; readonly rules: LoadedRules; readonly now: Instant; readonly actRetryMinutes: number }) => JobStep;
}

export type JobStep =
  | { readonly kind: 'wait'; readonly reason: string; readonly pending: readonly string[] } // `item get` shows the reason
  | { readonly kind: 'act'; readonly action: JobAction }
  | { readonly kind: 'finish'; readonly closeOut: JsonValue };

export interface Recipe {
  // ...the fields it has, and:
  // Verify recipes only. `builder`: the claim wakes the build's kept session, so the builder
  // grades its own work. `fresh`: a new session grades it. The recipe hash covers the field.
  readonly session?: 'builder' | 'fresh';
}

export interface MergeRules {
  readonly method: MergeMethod;
  // Check names that must conclude `success` at the head. boxxy reads the union of this list and
  // the base branch's required status checks. The loader refuses an empty list.
  readonly checks: readonly string[];
}

export interface LoadedRules {
  // ...the fields it has, and:
  readonly merge: MergeRules | null;
}

// `LoadRejectionReason` gains:
//   | { kind: 'unknown-worker'; phase; worker }       the phase kind names a worker the server did not pass
//   | { kind: 'merge-without-rules' }                 a `merge` step and no `merge` block
//   | { kind: 'empty-merge-checks' }                  `merge.checks` is empty
//   | { kind: 'builder-session-not-kept'; recipe }    `session: builder`, and the build step before it keeps no session

// ── libs/model/src/merge/types.ts: the merge decision ──────────────────────────────────────────
// `JobAction` and `MergeCloseOut` name these types, and a lib imports no module, so they live in
// the model. `decideMerge` lives in modules/train.

// One pull request. The merge train makes it a stack or a batch, with the same outcomes.
export interface MergeUnit { readonly members: readonly { readonly pullRequest: PullRequestRef; readonly head: CommitSha }[] }

// What the merge job reads on each read. The job decides nothing.
export interface MergeObservation {
  readonly pullRequest: PullRequestRef;
  readonly state: 'open' | 'closed' | 'merged';
  readonly head: CommitSha;
  readonly mergeable: 'clean' | 'conflict' | 'unknown'; // GitHub works it out late: `unknown` waits
  readonly checks: ReadonlyMap<string, 'success' | 'failure' | 'pending' | 'other'>; // the latest run of each name at `head`
  readonly baseRequired: readonly string[]; // the base branch's required status checks; can be empty
  readonly mergeCommit: CommitSha | null;
  readonly review: GateRecord | null; // the latest settled review of the item, from its close-out
  readonly verify: VerifyReading; // `Verifier.readAt` at `head`
}

export interface GateRecord { readonly head: CommitSha; readonly status: GateReading['status']; readonly attempt: AttemptId }

export type MergeOutcome = 'merged' | 'repair' | 'stale' | 'unverified' | 'closed' | 'stalled' | 'refused';

// `acted` comes from the attempt row: the last request boxxy sent, and the forge's answer to it,
// or null when that call got no answer.
export interface MergeRequest { readonly at: Instant; readonly head: CommitSha; readonly answer: MergeAnswer | null }

export declare function decideMerge(input: { observed: MergeObservation; rules: MergeRules; deadlinePassed: boolean; acted: MergeRequest | null; now: Instant }): JobStep;

// ── libs/model/src/ports/types.ts: the forge gains ────────────────────────────────────────────

export interface Forge {
  // ...readPullRequest, listOpenPullRequests, and:
  readPullRequestBody: (ref: PullRequestRef) => Promise<string>;
  // The latest run of each check name at `head`, from check runs and commit statuses.
  readChecks: (repo: RepoName, head: CommitSha) => Promise<ReadonlyMap<string, 'success' | 'failure' | 'pending' | 'other'>>;
  readRequiredChecks: (repo: RepoName, branch: string) => Promise<readonly string[]>;
  readMergeable: (ref: PullRequestRef) => Promise<'clean' | 'conflict' | 'unknown'>;
  // GitHub's compare of two heads: each changed file with its added and deleted lines.
  readChangedFiles: (repo: RepoName, from: CommitSha, to: CommitSha) => Promise<readonly { readonly path: string; readonly changedLines: number }[]>;
  // `PUT .../pulls/{n}/merge` with `sha: head`: 200 merged, 409 head moved, 405 not mergeable.
  mergeAtHead: (ref: PullRequestRef, head: CommitSha, method: MergeMethod) => Promise<MergeAnswer>;
}

export type MergeMethod = 'merge' | 'squash' | 'rebase';
export type MergeAnswer =
  | { readonly kind: 'merged'; readonly mergeCommit: CommitSha }
  | { readonly kind: 'queued' } // the train's `merge-async` answer; the direct merge never gives it
  | { readonly kind: 'head-moved' }
  | { readonly kind: 'not-mergeable'; readonly reason: string };

// ── libs/model/src/closeouts/types.ts: the close-outs ──────────────────────────────────────────

// The review close-out. The session sends the tool's raw result; the server replaces it with
// `ReviewGate.accept`'s reading before the phase kind's parser reads it. No limit but the
// close-out's own 120,000 bytes applies.
export interface ReviewCloseOut {
  readonly round: number | null; // null in a review close-out stored before the review gate
  readonly cause: RoundCause | null;
  readonly reading: GateReading; // from `ReviewGate.accept`, which matched its head to the pull request's head
  // Every review after the first: the changed lines between the earlier review's head and this
  // head, in files outside that review's `findingPaths`. pepys reads it from `closed_out`, to show
  // how much unrelated change reaches a `--fixes-only` review. Null for the first review, and when
  // the earlier review read no head.
  readonly unrelatedLines: number | null;
}

// The verify close-out, sent by the grading agent. The claim copies the recipe's `session` into
// the attempt's input, and the parser copies it from there.
export interface VerifyCloseOut {
  readonly result: { readonly kind: 'verified' } | { readonly kind: 'failed'; readonly features: readonly string[] } | { readonly kind: 'blocked'; readonly question: string } | { readonly kind: 'abandoned'; readonly reason: string };
  readonly session: 'builder' | 'fresh';
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

// The merge close-out, written by the runner from the drive's `finish`.
export interface MergeCloseOut {
  readonly outcome: MergeOutcome;
  readonly head: CommitSha;
  readonly required: readonly string[]; // the union the drive read
  readonly failed: readonly string[]; // `repair`: the red checks; empty for a conflict
  readonly cause: 'conflict' | 'checks-red' | null; // `repair` only
  readonly mergeCommit: CommitSha | null; // `merged` only
  readonly reason: string | null; // `refused` only: GitHub's text for the refusal
  readonly byBoxxy: boolean; // `merged`: true when boxxy's own call merged this head
  readonly verify: VerifyReading; // the reading the drive used, so pepys keeps the feature list
}

// `BuildInput` gains `sentBack`, in place of the review's findings as text:
//   | { from: 'review'; head; open: SeverityCounts; answerHint: string }
//   | { from: 'merge'; head; cause: 'conflict' | 'checks-red'; failed: readonly string[] }
//   | { from: 'verify'; head: CommitSha | null; features: readonly string[] } // the verify input's head
//   | null

// ── modules/dispatch: the attempt machine gains ────────────────────────────────────────────────
// `AttemptRow` gains `worker: WorkerKindName`, `actedAt` and `actedHead` (set by `acted`, which clears `actedAnswer`), `actedAnswer` (set by
// `answered`), `readAt` (set by `waited` and `acted`) and `waitReason` (set by `waited`).
// `AttemptEvent` gains `job-started` (starting ─▶ running, on the first read), `acted`, `answered`
// and `waited` (running ─▶ running) and `job-finished` (running ─▶ closing, with the runner's
// close-out).
// `DispatchTimeouts` gains `jobReadSeconds: 30`, the least time between two reads of one merge
// job, so one waiting merge makes about 10 forge calls a minute at most, and `actRetryMinutes: 5`.

// ── 04-facts.ts, section B: three new types (27 ─▶ 30). Entity: the item. ────────────────────

export interface ReviewAndMergeFacts {
  // written by: the runner, on a job's first read, in place of `boxxy.attempt.started`, which
  // names an atc session
  'boxxy.attempt.job_started': { readonly attempt: AttemptId; readonly worker: WorkerKindName };
  // written by: the runner, in the change that sets `actedAt`, before the forge call
  'boxxy.merge.requested': { readonly attempt: AttemptId; readonly repo: RepoName; readonly number: number; readonly head: CommitSha; readonly method: MergeMethod; readonly required: readonly string[] };
  // written by: the runner, in the change that sets `actedAnswer`; no fact for a call with no answer
  'boxxy.merge.answered': { readonly attempt: AttemptId; readonly head: CommitSha; readonly answer: MergeAnswer['kind']; readonly mergeCommit: CommitSha | null };
}
// A round, its cost and the verify reading need no new type: `boxxy.attempt.closed_out` carries
// each close-out above, and `boxxy.attempt.settled` its outcome and round. A review session
// writes `boxxy.attempt.started` as any session does.

declare type Friction = unknown;
