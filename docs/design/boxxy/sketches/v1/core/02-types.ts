// Design sketch. It is not compiled.
//
// 02-types.ts: boxxy's core for v1, as one set of types. No bodies.
//
// It covers the pipeline engine and the close-outs, the store with named limits and `decide`,
// and the worker port with the atc adapter. Each section header names the file of the existing
// boxxy repo that the section changes or adds.
// This sketch does not show the effect handlers. The build designs them from the rules stated
// here and in 03-flow.ts. The atc calls of each worker port method are built: v1-lifecycle.md,
// "The atc worker", holds them.
// `decide` is built: libs/model/src/planning/types.ts holds its types, and planning.md its rules.
// The seat take and `syncLimits` are built: the store section below says how.

import type { ContentHash, JsonValue } from '@boxxy/content-hash';

// ── libs/model/src/types.ts ───────────────────────────────────────────────────────────────

// One name and one pair of values for the design mode, everywhere: the item field `designMode`,
// with 'agent' or 'attended'.
export type DesignMode = 'agent' | 'attended';

// How dispatch reads an attempt's session. Written on the attempt row at the claim, from the phase
// kind's `mode`. Only design returns 'attended' in v1. The engine (`advance`) never reads it.
export type SessionMode = 'agent' | 'attended';

export interface ItemRow {
  // ...the fields that `libs/model` has on this row, and:
  // `designMode` is the one field of v1, and `boxxy.item.edited` names no other, so the type has
  // no index signature: an open record would let a fact carry a field that no schema checks.
  readonly fields: { readonly designMode?: DesignMode };

  // Markdown for the agent, 40,000 characters at most, empty by default. The owner writes it,
  // triage may rewrite it with `set.body`, and the launch prompt passes it on.
  readonly body: string;

  // boxxy is the ledger. Free labels, set by `item.file` and replaced by `item.edit`. No
  // registry: a label is any short string.
  readonly labels: readonly string[];

  // The session that the item keeps for rework, or null. It is state of the ITEM,
  // outside the attempt machine: no attempt owns it between two attempts. It names no text of
  // the item, so no fact carries it (the ledger rule of 04-facts.ts covers an item's content).
  readonly keptSession: KeptSession | null;
}

// The kept session. Written at the settle of a succeeded attempt whose phase is the target of an
// edge with `resume: true` (in the v1 rules: a build that settles `built`). 03-flow.ts, section H.
export interface KeptSession {
  readonly atcSession: AtcSessionId;
  readonly target: string; // the worker target the session runs on, as `SpawnRequest.target`
  readonly attempt: AttemptId; // the attempt it came from
  readonly keptAt: Instant;
  // The caller of the attempt it came from. The claim that resumes the
  // session copies it to the new attempt row; a fallback spawn replaces it at `started`.
  readonly caller: CallerIdentity | null;
}

// A note on an item. Append-only: no procedure edits or removes one. The fact
// `boxxy.item.noted` carries the full text. `item.get` shows the notes, `item.list` searches
// them, and the launch prompt of the next attempt of the item carries them.
export interface NoteRow {
  readonly item: ItemId;
  readonly seq: number; // 1, 2, 3… per item
  readonly text: string;
  readonly by: ActorRef;
  readonly at: Instant;
}

// modules/planning/src/concepts/pool.ts, `pool@2`: the filter field `designMode` gives 'agent'
// when the item sets none. So every design item matches one of the two design pools, and an
// item with no mode is never left unpicked with no wait reason.

// `brandSchemas.factId` (libs/model/src/rows/brand-schemas.ts) is a bare UUID version 7. The existing
// code has `manual:<uuid>`: the build changes it. `FactId`, the outbox `fact_id`, an evidence id
// that a close-out cites and `settled.criteria[].evidence` all use that one brand.
//
// What the build changes in the existing code: rename the rows and brands that say `link` or `pr`:
//   `LinkRow` ─▶ `RelationRow`, table `links` ─▶ `relations`, `LinkTypeName` ─▶ `RelationTypeName`,
//   `EvidenceKind` 'pr' ─▶ 'pull_request', `listSucceededAttemptsWithoutPr` ─▶ `…WithoutPullRequest`.
//   pepys's `LinkTypeName` (a link between entities) is another type; do not rename it.
// Add `phase: PhaseName | null` to `LeverRow`. Only `item.retry --phase` sets it.

// `round` is the item's round, not a phase's: 1, then one higher each time a `to` edge or a
// `retry --phase` sent the item back. The review of a reworked build has round 2, like the build.
//
// Where an item stands. Derived on every read by `findPosition` (03-flow.ts) from the item's
// settled attempts, its retry levers and the CURRENT rules. No row stores it: the attempt row
// holds no next step.
export type Position =
  | { readonly kind: 'phase'; readonly phase: PhaseName; readonly round: number }
  // `reviewed`, `pipeline-done`, `no-pipeline`, `split`. `duplicate`, `declined` and
  // `needs-owner` are not ends in the v1 rules; they are reasons of a `hold` (see `Edge`,
  // `{ hold: reason }`).
  | { readonly kind: 'end'; readonly reason: string }
  | { readonly kind: 'hold'; readonly reason: HoldReason; readonly then: PhaseName; readonly round: number };

export type HoldReason =
  | 'attempts used up'
  | 'rounds used up'
  // a settled attempt holds an outcome that the current rules do not map for its phase
  | 'outcome not in rules'
  // The reason that a `{ hold: reason }` edge of the rules names, such as `declined` or
  // `duplicate`. The loader brands it, and refuses a reason that equals one of the three engine
  // reasons above (`engine-hold-reason`), so a report can tell an engine hold from a rules hold.
  | RulesHoldReason;

export type RulesHoldReason = string & { readonly __rulesHold: unique symbol };

export interface ItemView extends ItemRow {
  readonly derived: DerivedState;
  readonly position: Position;
}

export type WaitingReason =
  | 'pull request open'
  | 'no pull request linked'
  | 'pull request closed unmerged'
  | HoldReason;

export type AttemptState =
  | 'starting'
  | 'running'
  | 'reconciling'
  | 'sleeping' // the session is stopped and kept; the attempt holds its lease and no seat
  | 'waking' // the attempt holds its seats again; the worker has not confirmed the resume
  | 'closing' // boxxy decided the attempt is over and waits for its live session to stop
  | 'succeeded'
  | 'failed';

export type LiveAttemptState = Exclude<AttemptState, 'succeeded' | 'failed'>;

// why an attempt is in `closing`
export type ClosingCause =
  | 'closed-out' // a valid close-out arrived
  | 'timed-out' // agent mode: past the step's `timeoutMinutes`
  | 'item-closed' // the owner closed the item while the attempt's session ran
  | 'stalled' // agent mode, no activity for `timeouts.stallMinutes`
  | 'skill-missing' // the session-start hook reported a named skill that is not there
  | 'turn-ended'; // agent mode: the agent's turn ended with no close-out, and nobody will prompt it

// Ten forced failures in all.
// `no-capacity`: the worker refused the spawn because the target has no free imp slot. The
// attempt settles as `failed` by the normal path, so its `claimed` fact has a `settled` fact.
// It does NOT count against `maxAttempts`.
// `skill-missing` and `stalled`: both count against `maxAttempts`.
// `usage-limit`: the session hit the account's usage limit. It does not count against
// `maxAttempts`, like `no-capacity`, and the pool backs off until the limit resets, for
// `timeouts.usageLimitBackoffHours` at most. A reset time that is not in the future means the
// reset is unknown, and the pool backs off for the whole `usageLimitBackoffHours`. The reading reports
// the limit (`usageLimitResetsAt` on a running `SessionReading`), and the reconcile table closes
// the attempt with the cause `usage-limit` (03-flow.ts, section B, note 10).
export type ForcedFailure =
  | 'spawn-refused' | 'no-capacity' | 'spawn-lost' | 'session-lost' | 'resume-lost' | 'timed-out' | 'item-closed'
  | 'skill-missing' | 'stalled' | 'usage-limit';

// `closeout-unsettleable`: the attempt holds a valid close-out, and the phase kind loaded at the
// settle threw on it or returned an outcome that is not in its list.
export type KnownFailure = ForcedFailure | 'closeout-missing' | 'closeout-unsettleable';

// The engine's own outcomes. No phase kind may list either name (the loader refuses one that does).
//   `lost`          the attempt ended with no valid close-out, or with a forced reason
//   `unsettleable`  the phase kind's `settle` threw on the stored close-out, or returned a name
//                   that the phase kind does not list (see `AttemptRow.outcome`)
export type EngineOutcome = 'lost' | 'unsettleable';

export interface AttemptRow {
  // ...id, item, phase, number, runner, recipeHash, rulesVersion, pool, leaseGen, spawnRequest,
  // spawnRequestHash, state, failure, atcSession, claimedAt, startedAt, endedAt: the fields that
  // `libs/model` has on this row. The build removes `slot` and `slotGen`. The row holds no
  // next step: the position is derived (`Position`).

  // Who may call for THIS attempt. The proven identity of the caller that runs the attempt's
  // session, as the worker reported it. null: the worker gave none, and then every session and
  // hook call for this attempt is refused.
  // Written with `started` and `reconciled`, and again when a reading gives another value. For
  // a claim that resumes a kept session, the claim copies `KeptSession.caller` to the new row,
  // so the second attempt has its caller before the session's first call.
  readonly caller: CallerIdentity | null;

  // ── facts of the claim ──
  readonly fields: FieldValues; // what decide saw; a wake and a rules reload match limits against these
  readonly mode: SessionMode;
  readonly round: number; // `Position.round` at the claim: the item's round, which every phase shares
  readonly input: JsonValue; // the phase kind's input, such as the findings for a build of round 2

  // ── seats ──
  readonly holdGen: number; // 1 at the claim, one higher on each wake; every held seat carries it

  // ── the close-out: the first valid one, never replaced ──
  readonly closeOut: CloseOut | null;
  readonly closeOutHash: ContentHash | null; // of the body as the agent sent it, with no wrapper around it
  readonly closeOutFact: FactId | null;

  // ── closing ──
  readonly closing: ClosingCause | null;
  readonly closingAt: Instant | null;

  // ── sleep and wake ──
  // Set before the worker's `suspend` call, cleared by the sleep, by a refusal, and by a move to
  // `closing`. With it set, an `ended` reading on a `running` attempt is boxxy's own stop.
  readonly suspendRequestedAt: Instant | null;
  readonly sleptAt: Instant | null;
  readonly wakeRequestedAt: Instant | null;
  readonly wokenAt: Instant | null;

  // ── facts of the settle ──
  // A name from the phase kind's `outcomes`, or an engine outcome. Never a name that the phase
  // kind does not list. When `settle` returned such a name, the attempt is `failed` with
  // `closeout-unsettleable`, `outcome` is the fixed `unsettleable`, and the name is in
  // `returnedOutcome`. `advance` holds the item with `outcome not in rules`, because no rules
  // file has an entry for `unsettleable`.
  readonly outcome: OutcomeName | EngineOutcome | null;

  // What the phase code returned, for an attempt settled as `closeout-unsettleable`.
  // Null when it threw, and for every other attempt. For the owner to read. `Settled`, the
  // input of `advance`, does not carry it, so no rules file can match it to an edge.
  readonly returnedOutcome: string | null;

  // Set when the attempt settled by the give-up rule while its session still ran. The runner keeps
  // sending `stop` for such a session, and sets `sessionStoppedAt` when a reading shows it stopped.
  readonly strayedAt: Instant | null;
  readonly sessionStoppedAt: Instant | null;

  // Cleanup: when boxxy forgot the attempt's session in atc (the imp is destroyed). No fact
  // type for session cleanup exists, so the row holds it and no fact does.
  readonly sessionForgottenAt: Instant | null;
}

// Primary key (attempt, agentSession). The build adds `product` and `source` to the existing row.
export interface AttemptSessionRow {
  readonly attempt: AttemptId;
  readonly agentSession: AgentSessionId;
  readonly atcSession: AtcSessionId;
  readonly product: Product;
  readonly source: 'worker' | 'hook';
  readonly seenAt: Instant;
}

// The type has both values. v1 workers are Claude (every v1 recipe has `agent: claude`), so v1
// writes `claude_code` only. Codex as a worker is later.
export type Product = 'claude_code' | 'codex';

export interface PullRequestRow {
  // ...repo, number, attempt, state, mergedAt, mergeCommit, checkedAt: the fields that
  // `libs/model` has on this row, and:
  // GitHub's own `id` of the pull request (a number, not the node ID and not `number`). pepys
  // builds its entity ID from it. Never null: the row is written only after the forge answered.
  readonly githubId: number;
  readonly url: string;
}

// ── libs/model/src/planning/types.ts: limits, pools and picks ──────────────────────────────────

export type Filter = Readonly<Record<string, readonly string[]>>;
export type FieldValues = Readonly<Record<string, readonly string[]>>; // each field holds a list of values, never one string

export interface Limit { readonly name: LimitName; readonly max: number; readonly counts: Filter }
export interface LimitFill extends Limit { readonly held: number }
export interface Pool { readonly name: PoolName; readonly takes: Filter; readonly order: readonly SignalKey[] }

export type Pick = StartPick | WakePick; // no member stops a running attempt
export interface StartPick { readonly kind: 'start'; readonly item: ItemId; readonly phase: PhaseName; readonly round: number; readonly pool: PoolName; readonly fields: FieldValues; readonly limits: readonly LimitName[] }
export interface WakePick { readonly kind: 'wake'; readonly attempt: AttemptId; readonly limits: readonly LimitName[] }

// The second kind is `wake`: `wake` is the claim; `resume` is the worker call.
export type Claim =
  | { readonly kind: 'start'; readonly attempt: AttemptRow; readonly spawn: SpawnRequest }
  | { readonly kind: 'wake'; readonly attempt: AttemptRow };

// `Snapshot.limits` is each limit as a `LimitFill`. `Snapshot.wakes` lists the sleeping attempts
// whose wake was asked for, oldest request first. `Wake` names the attempt's `pool`, because a
// pool in backoff holds back its wakes too. The build checked these against `decide`:
export interface Wake { readonly attempt: AttemptId; readonly item: ItemId; readonly phase: PhaseName; readonly pool: PoolName; readonly fields: FieldValues; readonly requestedAt: Instant }
export type WaitReason = { readonly kind: 'limit-full'; readonly limit: LimitName } | { readonly kind: 'backoff'; readonly pool: PoolName } | { readonly kind: 'no-pool' };
export interface Wait { readonly subject: { readonly kind: 'item'; readonly item: ItemId } | { readonly kind: 'wake'; readonly attempt: AttemptId }; readonly reason: WaitReason }
export interface Decision { readonly picks: readonly Pick[]; readonly waits: readonly Wait[] } // wakes first, then pool by pool
// modules/planning/src/decide.ts. Pure: the claim passes the pools in backoff, which the store never sees.
export declare function decide(input: { frame: Frame; pools: readonly Pool[]; snapshot: { limits: Snapshot['limits']; wakes: Snapshot['wakes'] }; backoff: readonly PoolName[] }): Decision;
// The match of a limit to a pick's fields is a helper inside `decide`; no `findLimits` exists.
// `SeatTake` and `SeatRelease` are built in libs/model/src/planning/types.ts, `LimitSeatRow` in
// libs/model/src/types.ts, and `ApplyResult` in libs/model/src/ports/types.ts. The store section
// below says how the store takes and syncs the seats.

// ── libs/model/src/rules/types.ts: phases and the pipeline ────────────────────────────────

// The outcome names of a phase are ONE list, on the phase kind. The loader reads it to check the
// rules, and the type of `settle`'s answer is built from it, so the two cannot differ.
export type OutcomeName = string & { readonly __outcome: unique symbol };

export interface PhaseKind<Body = unknown, Input extends JsonValue = JsonValue, Outcomes extends readonly string[] = readonly string[]> {
  readonly name: PhaseName;
  readonly version: number;
  readonly worker: WorkerKindName;
  readonly outcomes: Outcomes;
  readonly needsAcceptance: boolean;

  // The session mode of an attempt of this phase. The recipe is `<phase>/attended` when this
  // returns 'attended' and the kind's recipes name it, else `<phase>`. Default: 'agent'.
  readonly mode?: (item: ItemView) => SessionMode;
  readonly input: (ctx: PhaseInputContext) => Input;
  readonly closeOut: CloseOutParser<Body>;

  // called only with the attempt's valid close-out
  readonly settle: (input: SettleInput<Body>) => Settlement<Outcomes[number]>;
}

export declare function definePhase<Body, Input extends JsonValue, const Outcomes extends readonly string[]>(
  phase: PhaseKind<Body, Input, Outcomes>,
): PhaseKind;

export interface Settlement<Outcome extends string = string> {
  readonly state: 'succeeded' | 'failed';
  readonly failure: string | null;
  readonly outcome: Outcome;
  readonly effects: readonly Effect[];
  readonly frictionDropped: number;
}

export interface PipelineStep {
  readonly phase: PhaseName;
  readonly maxAttempts: number; // attempts in a row that ended `lost` or took an `again` edge
  // Required (the loader refuses a step without it). The clock of an AGENT-mode attempt of this step: one
  // stretch of running, from the later of `startedAt` and `wokenAt`; no clock while it sleeps.
  // An attended attempt has no step clock, because the owner sets its pace; the quiet rule
  // (`sleep.afterQuietMinutes`) and the sleep free its seats instead.
  readonly timeoutMinutes: Minutes;

  // EVERY outcome of the phase kind has an entry. The loader refuses a step that leaves one out,
  // so no outcome falls through to `next` or to a retry.
  readonly on: Readonly<Record<string, Edge>>;
}

export type Edge =
  | 'next'
  | 'again' // run the same phase again; counts against `maxAttempts` (the v1 rules use it for `abandoned`)
  // `max` is required when `to` names this step or an earlier one.
  // `resume: true` keeps the session of the target phase for the rework. The next attempt of
  // `to` wakes that session and gets its input as a message, in place of a spawn.
  | { readonly to: PhaseName; readonly max?: number; readonly resume?: boolean }
  | { readonly end: string }
  // The item holds for the owner with this reason; no effect of the close-out runs (a triage
  // `declined` or `duplicate` does NOT close the item). The owner confirms with
  // `boxxy item close <item>` or sends it back with `boxxy item retry <item>`.
  // "No effect" means no effect that CHANGES AN ITEM: `close-item`, the relations, and `set`
  // (kind, design mode, acceptance) are withheld. Friction is recorded all the same, because it
  // is a fact about the attempt only, and the parts of a `split` still file. The hold reason,
  // and the attempt's close-out in `item.get`, show the agent's result: `declined` with its
  // reason, `duplicate` with the other item, or `needs-owner` with its question.
  | { readonly hold: RulesHoldReason };

export type LoadRejectionReason =
  // ...the reasons that `libs/model` has, `unknown-filter-field` and `pool-without-limit` (this
  // sketch does not show their shapes; the build designs them), and:
  | { readonly kind: 'unknown-phase'; readonly phase: string }
  | { readonly kind: 'unmapped-outcome'; readonly phase: PhaseName; readonly outcome: string } // the phase kind lists it; `on` lacks it
  | { readonly kind: 'unknown-outcome'; readonly phase: PhaseName; readonly outcome: string } // `on` names it; the phase kind does not
  | { readonly kind: 'open-loop'; readonly phase: PhaseName; readonly outcome: string } // a backward `to` with no `max`
  | { readonly kind: 'edge-to-unknown-phase'; readonly phase: PhaseName; readonly to: string }
  | { readonly kind: 'step-without-recipe'; readonly itemKind: ItemKindName; readonly phase: PhaseName }
  | { readonly kind: 'step-without-timeout'; readonly phase: PhaseName }
  | { readonly kind: 'quiet-below-idle' } // `afterQuietMinutes` < `afterIdleMinutes`
  | { readonly kind: 'unattended-below-quiet' } // `afterUnattendedMinutes` < `afterQuietMinutes`
  | { readonly kind: 'engine-outcome-listed'; readonly phase: PhaseName; readonly outcome: EngineOutcome } // a phase kind lists `lost` or `unsettleable`
  | { readonly kind: 'skills-without-pin'; readonly recipe: string } // a recipe lists a skill, and the rules pin no skills commit
  | { readonly kind: 'resume-on-forward-edge'; readonly phase: PhaseName; readonly outcome: string } // `resume` on an edge that does not go back
  | { readonly kind: 'engine-hold-reason'; readonly phase: PhaseName; readonly outcome: string; readonly reason: string }; // a `hold` edge names an engine hold reason

export interface LoadedRules {
  // ...the fields that `libs/model` has on this type, and:
  readonly phases: ReadonlyMap<PhaseName, PhaseKind>;
  readonly limits: readonly Limit[];
  // `afterIdleMinutes`: one number for every session. The rules hold no sleep rule per filter.
  // `afterQuietMinutes`: at or above `afterIdleMinutes`. An attended session that reads
  // `working` and shows no activity (no atc trail event, no attach) for this long counts as waiting.
  // `afterUnattendedMinutes`: required, at or above `afterQuietMinutes`. The bound of an
  // attended session whose agent keeps working: it sleeps when the owner has not attached to
  // it for this long, counted from the latest of `startedAt`, `wokenAt` and `lastOwnerAt`.
  readonly sleep: { readonly afterIdleMinutes: Minutes; readonly afterQuietMinutes: Minutes; readonly afterUnattendedMinutes: Minutes };

  // The pin of the public skills repo: ONE commit for every recipe. Null when the rules file
  // has no `skills` block; the loader then refuses a recipe that lists a skill.
  readonly skills: SkillsPin | null;

  // `blocks`, `duplicate-of` and `relates-to` in v1. Registry data: a new type is a rules line,
  // not code.
  readonly relationTypes: ReadonlyMap<RelationTypeName, RelationType>;
}

export interface SkillsPin {
  readonly source: string; // the repository, as owner/name
  readonly ref: CommitSha; // a full commit; a branch or a tag is refused
}

// The recipe of a phase (docs/design/boxxy/core-model.md), with the field `skills`. The recipe
// hash covers `skills` AND the pin (`LoadedRules.skills`), so a new pin or a changed list is a
// new recipe hash. The session-start hook fetches each named skill at the pin into the
// session's workspace skills folder. atc refuses `pluginDirs` on an imp, so no recipe and no
// spawn request names a plug-in folder: the `boxxy` CLI and boxxy's hook plug-in are in the
// agent image.
// A build recipe names NO check command. Its text says to follow the repo's own agent
// instructions for checks.
export interface Recipe {
  // ...the fields that `libs/model` has on this type, and:
  readonly skills: readonly string[]; // such as ['bake-off']; empty: the phase needs none
}

// ── libs/model/src/closeouts/types.ts ─────────────────────────────────────────────────────────
// `CloseOut`, `DesignCloseOut`, `Design`, `RelationDraft`, `BuildInput`, `Effect`
// and `CloseOutWorld` are in that file, and docs/design/boxxy/close-outs.md, "The v1 phase
// kinds", holds their rules. `EffectHandlers` and `EffectPlan` belong to dispatch, which
// applies the effects. This sketch shows two parts: the triage close-out and the
// `set-acceptance` effect.

// A review session runs the command in its input and sends the review tool's raw result with
// `boxxy attempt close-out`, as any other agent session sends its close-out. The review phase has `worker: 'atc.session'` and its attempt takes a `workers` seat; no
// `reviews` limit exists. The review close-out is `ReviewCloseOut` in
// ../../next/review-and-merge/02-types.ts: the server builds it from `ReviewGate.accept`'s
// reading of the tool's raw result, and the core never reads a finding's text, as decision 0009
// (docs/decisions/0009-close-outs-hold-what-only-the-agent-knows.md) says.

// modules/closeout/src/close-out-limits.ts. The numbers:
//   262,144  a request body at the API (../edge/01-api.ts, rule 5). A body over it never
//            reaches the parser; the CLI prints the error and the agent sends a shorter one.
//   262,144  `outboxLimits.factBytes`: one fact on the wire (../edge/02-outbox.ts).
//   120,000  `closeOutBytes`: a close-out as stored, in any phase. Measured: the fact's wrapper
//            around the close-out is 466 bytes with UUID IDs, and the stored envelope allows
//            512 more. Under half of `factBytes` on purpose: a layer that escapes the JSON once
//            more (a close-out of quotes only) gives 2 x 120,000 + 978 = 240,978, still under.
// A test holds the relation: 2 x `closeOutBytes` + 1,024 < `factBytes`.
export interface CloseOutLimits {
  readonly closeOutBytes: 120_000;
}
export declare const closeOutLimits: CloseOutLimits;

export interface TriageCloseOut {
  // `declined` is a refusal only. A question for the owner is `needs-owner`, which settles with no
  // effect of its own; a split is `split`, which files each part and closes the item, and the
  // parser refuses it with no part. Each result is a strict object, so a field of another
  // result is refused instead of dropped.
  readonly result:
    | { readonly kind: 'accepted' }
    | { readonly kind: 'duplicate'; readonly of: ItemId }
    | { readonly kind: 'declined'; readonly reason: string }
    | { readonly kind: 'needs-owner'; readonly question: string }
    | { readonly kind: 'split'; readonly openItems: readonly OpenItem[] };
  readonly set?: {
    readonly kind?: ItemKindName;
    readonly designMode?: DesignMode;

    // Required with `accepted` when the item has no acceptance list. The parser refuses
    // `accepted` when neither the item nor this field holds one (`no-acceptance`). A design may
    // replace the list, and a design phase starts without one; an item that stands at build,
    // review or verify with no list derives `idea`, and no attempt of that phase starts.
    // Triage must not accept a criterion that only a release or a live run can prove. Such a
    // criterion belongs to QA after the merge; a build attempt cannot meet it. boxxy cannot
    // check this by code: it is a stated rule of the triage recipe.
    readonly acceptance?: readonly { readonly text: string }[];

    // The whole new body, of `itemBodyMaxChars` (40,000) or fewer, in place of the item's body.
    // Settle writes it with `set-body`, which records `boxxy.item.edited` with `byAttempt`.
    readonly body?: string;
  };
  readonly relations: readonly RelationDraft[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export type CloseOutProblem =
  // ...the four that `libs/model` has, and `unknown-item`, `unknown-kind`, `refused-relation`,
  // `phase-rule` (this sketch does not show their shapes; the build designs them). The build
  // removes `wrong-phase`: the phase comes from the attempt row.
  | { readonly kind: 'no-acceptance' }
  // The valid close-out is over `closeOutLimits.closeOutBytes` as stored. `bytes` is its size,
  // so the agent knows how much to cut. No write; send again.
  | { readonly kind: 'too-large'; readonly bytes: number; readonly max: number };

// `Effect` has these members, with the `item.edit` builder as their handler:
//   | { readonly kind: 'set-acceptance'; readonly criteria: readonly Criterion[] }
//   | { readonly kind: 'set-body'; readonly body: string }

// ── libs/model/src/ports/types.ts: the worker port ─────────────────────────────────────────────

// A proven caller. The core compares two of these for equality (both fields) and knows nothing
// more about them: the fields name no kind of worker host. The worker adapter says who runs a
// session (`StartOutcome` `started`, from `start`, `resume` and `resumeKept`, and
// `SessionReading` `running`, each carry `caller: CallerIdentity | null`); the edge's
// `CallerProof` port says who sent a request.
export interface CallerIdentity {
  readonly issuer: string;
  readonly subject: string;
}

export interface WorkerKind {
  start: (request: SpawnRequest) => Promise<StartOutcome>;
  reconcile: (attempt: AttemptRow) => Promise<SessionReading>;
  // The adapter refuses with `active` only when the session shows activity after `ifIdleSince`.
  // It does not refuse a session only because its atc state is `running`: that would refuse the
  // quiet attended session that the quiet rule must put to sleep.
  suspend: (attempt: AttemptRow, ifIdleSince: Instant | null) => Promise<SuspendOutcome>;
  resume: (attempt: AttemptRow) => Promise<StartOutcome>;

  // Stops the session and keeps it listed. Safe to send twice. On atc this is the same call as
  // `suspend` with no idle check: `session.kill { stopOnly: true }`. So after a stop the reading
  // is `suspended` on a target whose host can sleep, and `ended` on a local target. A stop
  // deletes neither the session nor its host; cleanup removes the stopped session later, with
  // `forget` (03-flow.ts, section H).
  stop: (attempt: AttemptRow) => Promise<StopOutcome>;

  // Cleanup. Removes a STOPPED session from atc; on an imp target the imp is destroyed. atc's
  // forget keeps a workspace that holds unpushed work. Safe to send twice.
  forget: (session: AtcSessionId) => Promise<{ kind: 'forgotten' | 'absent' } | { kind: 'refused' | 'unknown'; reason: string }>;

  // Wakes a kept session and sends `request`'s prompt (the phase input) as a message, in place
  // of a spawn. `started`: the same atc session carries the new attempt from then on.
  resumeKept: (kept: KeptSession, request: SpawnRequest) => Promise<StartOutcome>;
}

// `StartOutcome`, `SuspendOutcome`, `StopOutcome`, `SpawnRequest` (with `target`),
// `createAtcWorker`, `createFakeWorker`, `workerContract`: this sketch names them and does not
// show their shapes. The build designs them from the rules stated here and in 03-flow.ts. Two
// rules for them:
//
// The `refused` member of `StartOutcome` has a typed cause, so that `startClaim` does not read
// the free text:
//   | { kind: 'refused'; cause: 'capacity' | 'other'; reason: string }
// `capacity`: the target has no free imp slot.
// Not checked: which error atc gives when the target has no free imp slot.
//
// A spawn request carries `cwd`, a folder on the target, or `source`, a `GitSource`
// (`url`, `ref`) that atc clones and trusts. `createAtcWorker` checks, before
// each spawn with a `cwd`, that the folder is one the agent trusts. A session that atc starts in an untrusted folder waits
// at the trust dialog (atc `needs_you`, no turn runs). When the folder is not trusted, `start`
// spawns nothing and answers `refused`, cause `other`, reason `worker folder not trusted`.
//
// Built: adapters/worker-atc. `createAtcWorker({ client, trustedFolders, credentialSources })`: `client` is
// `AtcClient`, the seven atc gateway MCP tools the adapter calls (`atc_session_spawn`,
// `atc_session_get`, `atc_sessions_list`, `atc_session_stop`, `atc_session_adopt`,
// `atc_session_forget`, `atc_message_send`), which `createAtcMcpClient({ url, host, token, fetch,
// timeoutMs })` gives over MCP streamable HTTP; `trustedFolders` maps each worker target to the
// folders the agent trusts there, from the app's configuration (atc has no call that reads
// trust); `credentialSources` lists the configured git sources with a `credentialRef`, and a
// spawn sends a variable name only with the URL that one of them pairs it with. The tool behind each method and the map of each atc answer to an outcome are in
// v1-lifecycle.md, "The atc worker". `isCapacityRefusal` reads `capacity` from the refusal's
// structured `code` and `problem`. The caller comes from
// `findCallerIdentity`, which reads the `host` field (`name`, `id`, `issuer`); atc reports no
// usage limit, so `usageLimitResetsAt` is always null (v1-open.md). `StartOutcome`,
// `SuspendOutcome`, `StopOutcome`, `ForgetOutcome` are in libs/model/src/ports/types.ts. The
// stand-in is `@boxxy/worker-atc/test-utils/create-fake-atc` behind `create-fake-atc-server`, an
// in-process MCP endpoint; the worker contract runs against the adapter on a local target and on
// a target that sleeps its hosts.

export type SessionReading =
  // a live agent process. atc's `running`, `needs_you` and `done` all map here: `done` is
  // "the turn ended and the session waits for a prompt", so it is never an end.
  | { readonly kind: 'running'; readonly atcSession: AtcSessionId; readonly agentSession: AgentSessionId | null; readonly attention: Attention; readonly lastActivityAt: Instant;
      // atc's `lastAttachedAt` alone: the last time the owner attached to the session.
      // `lastActivityAt` holds the later of this and atc's last trail event.
      readonly lastOwnerAt: Instant;
      // set when the session hit the account's usage limit: the time at which the limit
      // resets, or the time the limit was seen when atc gives no reset time. The worker
      // adapter maps it from atc's session (Not checked: what atc reports, v1-open.md).
      readonly usageLimitResetsAt: Instant | null }
  | { readonly kind: 'suspended'; readonly atcSession: AtcSessionId; readonly agentSession: AgentSessionId | null; readonly asked: boolean }
  | { readonly kind: 'ended'; readonly atcSession: AtcSessionId; readonly agentSession: AgentSessionId | null }
  | { readonly kind: 'absent' };

export type Attention = 'working' | 'needs-input' | 'turn-ended';

export interface StoreReader {
  // The reader derives each item's position and state from the rules.
  readSnapshot: (now: Instant, rules: Pick<LoadedRules, 'kinds' | 'phases'>) => Promise<Snapshot>;

  // The attempt the session carried, live or settled. It matches settled attempts too, so that
  // a repeat of a call after the settle gets its answer. One atc session carries one attempt,
  // except a kept session, which carries a second attempt of the same item and phase. Then this
  // gives the LATEST attempt that the session carries; the earlier one is settled.
  // It is NOT the way to pick the attempt of a session's call. On a kept session it gives the
  // second attempt for a request that the first attempt sent. A call names its attempt by ID
  // (`CallRef`). Callers of this lookup: the runner, and every session call, which passes the
  // row to `pickCallAttempt` (03-flow.ts, section D) only to see that the named attempt is the
  // current one of the calling session.
  findAttemptBySession: (session: AtcSessionId) => Promise<AttemptRow | null>;
  // The edge's lookup for a session or hook call. The atc session whose LATEST attempt row
  // holds this caller. An older attempt's row never counts. `ambiguous`: two sessions' latest
  // attempts hold it; the edge refuses.
  findSessionByCaller: (caller: CallerIdentity) => Promise<AtcSessionId | 'ambiguous' | null>;
  listItemAttempts: (item: ItemId) => Promise<readonly AttemptRow[]>; // oldest first
  listLiveAttempts: () => Promise<AttemptRow[]>; // every `LiveAttemptState`
  listStrayAttempts: (since: Instant) => Promise<AttemptRow[]>; // `strayedAt` set, `sessionStoppedAt` null
  listLimits: () => Promise<LimitFill[]>;
  listLimitSeats: () => Promise<LimitSeatRow[]>;
  listItemNotes: (item: ItemId) => Promise<readonly NoteRow[]>; // oldest first
  listUnsentNotices: (limit: number) => Promise<readonly NoticeRow[]>; // for `runner.status`, whatever their `nextTryAt`
  listNoticesDue: (now: Instant, limit: number) => Promise<readonly NoticeRow[]>; // for the notice port, below: unsent rows whose `nextTryAt` has passed, oldest `nextTryAt` first
  listKeptSessions: () => Promise<readonly { item: ItemId; kept: KeptSession }[]>; // for cleanup of kept sessions
  listSessionsToForget: (now: Instant) => Promise<readonly AttemptRow[]>; // for cleanup: the sessions that `forget` is due for
}

// Built: the store port family is in libs/model/src/ports/types.ts, with SQLite and the memory
// store held to one contract (modules/dispatch/src/test-utils/claim-store-contract.ts). Where
// the build differs from this sketch:
//   - The item reads (`readSnapshot`, `readItem`, `readItemDetail`, `listItems`,
//     `listOpenIssues`) take `ItemRules`, the part of `LoadedRules` they read: each kind's
//     pipeline and each phase's `needsAcceptance`. One pure function, `buildItemViews`, folds
//     each item's settled attempts and `item.retry` levers with `findPosition`, then derives
//     its state with `deriveItemState`.
//   - `listSessionsToForget(failedEndedBefore)`: cleanup passes the cutoff of a failed attempt,
//     not the time now. A succeeded attempt is due at once. Only the latest attempt of a
//     session counts, and a kept session or a stray session not yet stopped is left out.
//   - `findAttemptByAgentSession` gives the latest attempt bound to the agent session, and
//     `findSessionByCaller` matches on each session's latest attempt alone.
//   - `StoreReader` also has the outbox reads (../edge/02-outbox.ts, section B).
//
// The seat take. `RowWrite` has `{ op: 'take-seats', take: SeatTake }` and
// `{ op: 'release-seats', release: SeatRelease }`; no plain write names the seats table.
//   - All or none. The pure `pickSeatTake` reads the limits with their held counts, under the
//     write lock that `exclusive` holds, and answers a seat per named limit, `limit-full` or
//     `unknown-limit`. A refusal rolls the whole change back.
//   - `overCap: true` takes a seat past `max`, for a wake over the cap. A limit that the last
//     sync did not store is refused even then.
//   - A release with no seat held is no refusal.
//   - The partial unique index `limit_seats_held` (limit, attempt, hold_gen WHERE released_at
//     IS NULL) refuses a second held seat of one hold generation.
// `under` is optional or null for a change made under no lease. With `holdGen`, the store also
// checks the hold generation of the lease's attempt, so a change built before a wake fails.
//
// `syncLimits(limits, at)` writes outside `StoreChange`, like the outbox bookkeeping and
// `markNoticeTried`: no fact, no store version. It is the one seat writer besides the attempt
// change builder. The pure `collectSeatSync` gives its writes:
//   - the stored limits become the loaded ones;
//   - a held seat of a limit that went, or whose `counts` no longer match the attempt's stored
//     fields, is released;
//   - an attempt in a seated state (starting, reconciling, running, waking, closing) gets a
//     seat in each limit that newly counts it, past `max` when the limit is full. An attempt
//     that closed out while asleep is left out: its last `sleptAt` is later than its `wokenAt`.
// It writes seats outside the builder because a rules change is no attempt move: the attempt's
// state does not change, only which limits count it.

// The notice port. One method. boxxy calls it AFTER the store change that puts an
// item on hold, never inside it, and a failed notice never fails that change.
//   - The change that settles an attempt also writes one `notices` row when the item's position
//     after it is a hold. The settle reads the position for this row only, and still stores none.
//   - The runner tick sends each unsent row, marks it sent, and tries a failed one again on a
//     later tick, with no cap on tries (see owner-notices.md).
//   - The rows are in a small table, not in the fact outbox. The outbox sends facts to pepys in order and
//     parks on a failure; a notice has another target and must not hold facts back.
//   - A hold that a rules change makes (no settle) gets no notice.
// Adapters: `createAtcNotifier({ client, session })`, which sends an atc message to ONE session by
// its gateway ID (from `BOXXY_ATC_NOTICE_SESSION`, see owner-notices.md); `createFakeNotifier`, for
// tests; `createNullNotifier`, when the environment sets no notice session.
// An agent's question takes the same path: the agent closes out `blocked` with the question in
// the close-out; the rules map `blocked` to a hold; the notice goes out; the owner answers with
// a note (`item.note`) and `item.retry`, and the next attempt gets the note in its input.
export interface Notifier {
  tellHold: (notice: { readonly item: ItemId; readonly reason: HoldReason; readonly at: Instant; readonly key: string }) => Promise<{ kind: 'sent' } | { kind: 'refused'; reason: string } | { kind: 'uncertain'; reason: string }>;
}
// Built: adapters/notifier-atc. The client is one structural call, `sendMessage({ session, text,
// idempotencyKey })`, that resolves when atc takes the message and rejects when atc refuses it. A
// rejection becomes `refused` for the codes in owner-notices.md and `uncertain` for every other,
// with the error's string `code` as the reason (`no_such_session`) or `atc send failed`; the error
// text is never copied. The notice carries its row's key, and the adapter keeps no state.

export interface NoticeRow {
  readonly id: number;
  readonly item: ItemId;
  readonly reason: HoldReason;
  readonly at: Instant;
  readonly tries: number;
  readonly sentAt: Instant | null;
  readonly keySeq: number;
  readonly keyTries: number;
  readonly nextTryAt: Instant;
}

// `StoreTx` has no method that sets the suspend mark. The mark is attempt state, so it is a
// `StoreChange` from the one module that writes attempt state (below). It writes no fact. The
// store applies a change with no fact, and the change moves no store version.

export interface Forge {
  readPullRequest: (ref: PullRequestRef) => Promise<PullRequestReading | 'not-found'>;
  listOpenPullRequests: (repo: RepoName) => Promise<PullRequestRef[]>;
}

export interface PullRequestReading {
  // ...url, state, mergedAt, mergeCommit, commits: the fields that `libs/model` has on this type, and:
  readonly githubId: number; // `id` of `GET /repos/{owner}/{repo}/pulls/{number}`
}

// ── modules/dispatch/src/attempts/build-attempt-change.ts (the build adds this file): the ONE writer of attempt state
// The attempt code lives in `modules/dispatch/src/attempts/`.
//
// Every write to the `attempts` and `attempt_sessions` tables, and every seat write of an attempt
// move, is built here; `syncLimits` (the store section above) is the one other seat writer. No other file of the package names `table: 'attempts'`; the test of
// scripts/collect-attempt-writes.ts fails when one does (tests and test-utils fixtures aside).
// Callers decide WHEN (they hold the reading, the claim or the procedure input); this module
// decides WHETHER the move is allowed and WHAT is written. A caller applies the change with
// `tx.applyChange` and never edits the writes it holds. Two callers add writes and facts of their
// own to the same change: `settleAttempt` (the effect plans) and `item.close` (the item's close
// and `boxxy.item.closed`). So `closeOutAttempt`, `actOnReading`, `settleAttempt`
// and `requestWake` build no write of their own, and the sleep, the wake and the suspend mark
// have no builder of their own.

// Built: `AttemptEvent` is in modules/dispatch/src/attempts/types.ts, and `AttemptChange` and
// `buildAttemptChange` in build-attempt-change.ts. Where the build differs from this sketch:
//   - `buildAttemptChange` also takes the `actor` of the facts it records.
//   - `claimed` carries what the new row and the `claimed` fact need and this sketch's event lacked:
//     `number`, `runner`, `leaseGen`, the recipe's hash and rules version, `skillsRef`, the
//     spawn request with its hash, `caller` (the kept session's, or null), and the decision
//     without its ID, attempt and time. The builder makes the attempt ID and the decision ID.
//   - `started` carries `via` (`start` gives the `started` fact, `reconcile` the `reconciled`
//     fact), the outcome's `caller`, and `resumeFallback`, always set. `resumed` carries `caller`.
//   - `stalled` and `skill-missing` carry nothing: no fact of their own reads a field.
//   - `settled` carries the fields of the `settled` fact in place of `plans` (03-flow.ts,
//     section A): the effect writes are the caller's. `EffectPlan`, `EffectContext` and
//     `EffectHandlers` are in modules/dispatch/src/closeouts/types.ts (03-flow.ts, section D).
//   - `usage-limited` moves a running attempt to `closing` with the cause `usage-limit`.
//   - `AttemptChange` is `{ kind: 'change', change }` or `not-allowed`, and `change` is the
//     builder's own store change: `at`, `under` (with `holdGen`, or null), the writes (attempt
//     row, attempt session, lease, decision, seat take and seat release) and the facts, which
//     can be empty. The store's `StoreChange` takes it as it is: the builder's change is one
//     of its forms, and a contract case proves the race guard on both stores.

export type WakeSource =
  | 'command' // `boxxy item wake`
  | 'session-ran' // a reading shows the session running while the attempt sleeps
  | 'host-slept-unasked'; // the host slept with no request, so the attempt wakes by itself

// ── modules/dispatch/src: the callers ──────────────────────────────────────────────────────────

export declare function claimNext(input: ClaimInput): Promise<Claim | null>; // events `claimed`, `woken`
// `startClaim` and `resumeClaim` return the fault of an agent session that another attempt
// holds, a spawn or a wake that the worker refused, or null. The runner logs each fault at warn
// level; a refusal carries the worker's reason, which no fact carries.
export interface WorkerRefusal { kind: 'fault'; fault: 'spawn-refused' | 'wake-refused'; attempt: AttemptId; item: ItemId; cause: 'capacity' | 'other'; reason: string }
export type RunnerFault = SessionFault | WorkerRefusal;
export declare function startClaim(input: StartClaimInput): Promise<RunnerFault | null>; // `started`, `spawn-unanswered`, `settled` (spawn-refused, no-capacity)
// A spawn that the worker refuses for capacity (no free imp slot on the host) does not count
// against `maxAttempts`; the pool is marked full for `timeouts.capacityBackoffSeconds` and the item
// is ready as it was.
// The attempt is NOT deleted. It settles through the normal path as `failed`, forced
// `no-capacity`, so its `claimed` fact has a `settled` fact.
// Only a refusal for another cause (bad request, unknown target, auth) settles as `spawn-refused`.
// The limit `workers` (max 7 in v1) is a ceiling; the host's real free slots can be lower.
// The table is in 03-flow.ts, section F.
export declare function resumeClaim(input: ResumeClaimInput): Promise<RunnerFault | null>; // `resumed`
export declare function closeOutAttempt(input: CloseOutInput): Promise<CloseOutAnswer>; // `closed-out`

// What every call from inside a session gives the core.
//   attempt  from the REQUEST: the ID that the session read with `attempt.current`.
//   session  from the EDGE: the atc session that it found for the proven caller.
//   caller   from the EDGE: the proven identity itself, so that the core checks it against
//            the CURRENT attempt's own `caller`, inside the lock.
// The core answers `not-current`, with no write, unless `attempt` is the current attempt of
// `session` (`pickCallAttempt`, 03-flow.ts, section D).
export interface CallRef {
  readonly attempt: AttemptId;
  readonly session: AtcSessionId;
  readonly caller: CallerIdentity;
}

// `call` names the attempt. `closeOutAttempt` does not pick the attempt by a lookup of the
// session's latest attempt (see `findAttemptBySession`).
export interface CloseOutInput {
  readonly store: ClaimStore;
  readonly call: CallRef;
  readonly body: unknown;
  readonly rules: LoadedRules;
  readonly now: Instant;
  readonly newId: NewId;
}
// `applied`, or `not-allowed` when the attempt does not sleep or has its request already.
export declare function requestWake(input: { store: ClaimStore; attempt: AttemptId; by: WakeSource; actor: ActorRef; now: Instant; newId: NewId }): Promise<MoveResult>; // `wake-requested`
// `applied`, `not-allowed` for an attempt that the machine cannot settle, or `refused` with the
// store's answer, as every move of a caller outside the builder.
export declare function settleAttempt(input: SettleAttemptInput): Promise<MoveResult>; // `settled`

// modules/dispatch/src/attempts/end-item-attempts.ts (the build adds this file). Pure. The writes and facts that end
// every live attempt of an item that is about to close. `item.close` puts them in the SAME change
// as the item's close, so an item never closes with an attempt that nothing will end.
// As built it also takes the `actor`, and gives `under`: the lease of the one live attempt, for
// the store change.
export declare function endItemAttempts(input: { attempts: readonly AttemptRow[]; actor: ActorRef; now: Instant; newId: NewId }): { writes: readonly RowWrite[]; facts: readonly AnyNewFact[]; ended: readonly { attempt: AttemptId; how: 'settled' | 'closing' }[]; under: StoreChange['under'] | null };
// The rest. It binds a new agent session that the reading shows first, and returns the fault
// of one that another attempt holds, or null.
// the faults of the reading's bind and of its respawn or resume
export declare function actOnReading(input: ActOnReadingInput): Promise<RunnerFault[]>;

// Pure. The reconcile table (03-flow.ts, section B). The action type has one name,
// `ReadingAction`. It takes the sleep times of the rules (`sleep`), not one number.
export declare function pickReadingAction(input: { attempt: AttemptRow; reading: SessionReading; step: PipelineStep | null; sleep: LoadedRules['sleep']; now: Instant }): ReadingAction;

export type ReadingAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'bind-only' }
  | { readonly kind: 'move-to-running'; readonly via: 'start' | 'reconcile' | 'resume' }
  | { readonly kind: 'respawn' } // gives up with `spawn-lost` after `timeouts.spawnLostMinutes`
  | { readonly kind: 'clear-mark' }
  | { readonly kind: 'sleep-if-idle'; readonly waitingSince: Instant }
  | { readonly kind: 'sleep-unattended'; readonly since: Instant } // mark, `worker.suspend(attempt, null)`, then `slept`
  | { readonly kind: 'await-spawn' } // `closing` with no session seen; no respawn, no settle yet
  | { readonly kind: 'sleep'; readonly requestWake: boolean }
  | { readonly kind: 'request-wake'; readonly by: WakeSource }
  | { readonly kind: 'wake-over-cap' }
  | { readonly kind: 'resume' } // gives up with `resume-lost` after `timeouts.resumeLostMinutes`
  | { readonly kind: 'close'; readonly cause: 'timed-out'; readonly afterMinutes: Minutes }
  | { readonly kind: 'close'; readonly cause: 'usage-limit'; readonly resetsAt: Instant }
  | { readonly kind: 'close'; readonly cause: 'turn-ended' | 'stalled' }
  | { readonly kind: 'stop' }
  | { readonly kind: 'settle'; readonly forced: ForcedFailure | null; readonly sessionStopped: boolean };

// Since when the session has waited for the owner, or null. It reads the session mode from
// `attempt.mode`. It takes `now` and the quiet time, for the attended session that reads
// `working`. Built as modules/dispatch/src/readings/find-waiting-since.ts, from the rules of
// 03-flow.ts (sections B and C); `find`, because it is pure and can give null.
export declare function findWaitingSince(input: { attempt: AttemptRow; reading: SessionReading; quietAfterMinutes: Minutes; now: Instant }): Instant | null;

// modules/dispatch/src/timeouts.ts, with the type in types.ts. Every time limit of dispatch
// that is not in the rules. Each name ends with its unit.
export interface DispatchTimeouts {
  readonly spawnLostMinutes: Minutes; // 10: `starting` or `reconciling` with no session
  readonly resumeLostMinutes: Minutes; // 10: `waking` with no running session
  readonly closingGiveUpMinutes: Minutes; // 10: `closing` with a session that does not stop
  readonly stopGraceSeconds: number; // 60: a `closing` session inside a turn is not stopped before this
  // 10, two ticks of the runner's 5-second loop: a session that runs on a `sleeping` attempt
  // wakes over the cap this long after its wake request. The table reads the time, never a
  // count of ticks.
  readonly seatlessSeconds: number;
  // 60. After a spawn or a resume that the worker refused for capacity, `claimNext`
  // gives no pick in that attempt's pool for this long.
  // The mark lives in the runner's memory, per pool, not in the store. A restart forgets it,
  // and the next claim finds out again.
  // It holds back START picks and WAKE picks. `resumeClaim` marks the pool of an attempt whose
  // wake the host refused for capacity. Without that the claim loop of one tick picks the
  // refused wake again and never ends.
  readonly capacityBackoffSeconds: number;
  readonly stallMinutes: Minutes; // 30. Agent mode: a session with no activity for this long is stopped
  readonly keptSessionHours: number; // 24. A kept session is forgotten this long after `keptAt`
  readonly failedSessionHours: number; // 24. A failed attempt's stopped session is forgotten after this
  readonly usageLimitBackoffHours: number; // 24: the most a pool waits after `usage-limit`, and the wait when the reset time is not in the future
  // 24: how long the runner keeps sending `stop` to a stray session. A stray attempt with no
  // atc session id is looked up by its spawn name, `boxxy/<attempt_id>`, for this long.
  readonly strayHours: number;
}
export declare const timeouts: DispatchTimeouts;

// The backoff mark that section F of 03-flow.ts names, as a type.
// The type is in `@boxxy/model` (libs/model/src/ports/types.ts), because dispatch reads it. The
// one implementation is apps/server/src/create-capacity-backoff.ts (the build adds this file):
// a Map in the runner's memory, per pool, not in the store. `startClaim` and `resumeClaim` call
// `hold` after a refusal for capacity. `claimNext` calls `listHeld` and gives no start pick in
// those pools and no wake pick of an attempt whose `pool` is one of them. All three get it
// from the tick's deps (`TickDeps.backoff`).
export interface CapacityBackoff {
  hold: (pool: PoolName, until: Instant) => void;
  listHeld: (now: Instant) => readonly PoolName[]; // each pool whose `until` is after `now`
}

// modules/dispatch/src/test-utils/create-fake-worker.ts: `FakeWorker`, a worker for tests. This
// sketch does not show its shape; the build designs it. It has this method:
//   failAlways: (method: keyof WorkerKind, outcome: { kind: 'refused' | 'unknown'; reason: string }) => void;
// apps/server/src/run-tick.ts: `TickDeps` is { store, worker, rules, runner: RunnerId, now, backoff: CapacityBackoff }.

// In the rules, not here: `PipelineStep.timeoutMinutes`, `PipelineStep.maxAttempts`, `Edge.max`,
// `sleep.afterIdleMinutes`.

// ── libs/model: the engine, pure ───────────────────────────────────────────────────────────────

// `outcome` is a name the attempt's phase kind listed when it settled, or an engine outcome.
// It is the only field of the settle that `advance` reads.
export interface Settled {
  readonly phase: PhaseName;
  readonly outcome: string; // a phase outcome, or an engine outcome (`lost`, `unsettleable`)
  readonly endedAt: Instant;

  // The attempt's failure, read by `findPosition` for two values: `no-capacity` and
  // `usage-limit`. Such an attempt is skipped: it does not move the item and is not counted.
  readonly failure?: string | null; // optional, so that a test's settled attempt may leave it out
}

// One step of the engine. It names no phase. The answer is never stored. `counted` holds the
// attempts settled before this one and after the item's latest retry lever. `round` is the
// item's round before this attempt's edge; a retry does not reset it.
export declare function advance(input: { pipeline: Pipeline; settled: Settled; counted: readonly Settled[]; round: number }): Position;

// The fold. `attempts` are the item's settled attempts, oldest first; `retries` its `item.retry`
// levers; `pipeline` is the pipeline of the item's kind NOW, in the rules loaded NOW.
export declare function findPosition(input: { pipeline: Pipeline | null; attempts: readonly Settled[]; retries: readonly RetryLever[] }): Position;

export interface RetryLever {
  readonly at: Instant;

  // Optional: `boxxy item retry <item> --phase build`. Absent: the hold's `then`, or the
  // position as it stands. It is the only path back to build after a passed review.
  readonly phase: PhaseName | null;
}

// The rules dry run, a part of v1. modules/rules/src/dry-run/dry-run-rules.ts (the build adds
// this file). Pure, and it writes nothing: no row, no fact. `current` is the rules the server runs;
// `proposed` is a rules file that passed the loader. For each OPEN item (`closed_at` is null) it
// folds `findPosition` twice, over the same settled attempts and retry levers, and gives both
// positions. `moved` is true when the two differ. A live attempt is not touched by a rules
// change (03-flow.ts, section E), so the line of an item with a live attempt says where the item
// stands after that attempt settles as stored so far.
export interface RulesDryRunLine {
  readonly item: ItemId;
  readonly now: Position; // under `current`
  readonly then: Position; // under `proposed`
  readonly moved: boolean;
}

export type RulesDryRun =
  | { readonly kind: 'loaded'; readonly version: string; readonly items: readonly RulesDryRunLine[]; readonly moved: number }
  | { readonly kind: 'rejected'; readonly rejections: readonly LoadRejectionReason[] }; // the file does not load; no item is read

export declare function dryRunRules(input: {
  readonly current: LoadedRules;
  readonly proposed: LoadedRules;
  readonly items: readonly { readonly item: ItemView; readonly attempts: readonly Settled[]; readonly retries: readonly RetryLever[] }[];
}): readonly RulesDryRunLine[];

// ── libs/contract/src: the procedures (one shape each) ─────────────────────────────────────────

// A call names its attempt, and names no atc session. The session of a call comes from the
// caller that the edge proved, never from the request (../edge/01-api.ts, section E).
// The edge builds `CallRef { attempt: SessionRef.attempt, session, caller }`.
export interface SessionRef {
  readonly attempt: AttemptId; // from `attempt.current`; the CLI fills it; no agent types it
  readonly agentSession?: AgentSessionId;
  readonly product?: Product;
}

export interface Procedures {
  // No `phase` in the input: the phase comes from the attempt row, and the agent passes none.
  'attempt.closeOut': { input: { session: SessionRef; closeOut: unknown }; output: CloseOutAnswer };
  // `skills` tells the session-start hook what to fetch: the pin and the names that the
  // attempt's recipe lists. `notes` are the item's notes, oldest first.
  // No input. The edge answers with the latest attempt of the session that the token gives.
  // This is how a session, fresh or kept, learns its attempt ID.
  'attempt.current': { input: Record<string, never>; output: { attempt: AttemptRow; item: ItemView; input: JsonValue; skills: { pin: SkillsPin | null; names: readonly string[] }; notes: readonly NoteRow[] } | { refused: 'no-attempt' } };
  // The hook fetches the skills FIRST, then binds. `missingSkills` names each listed skill
  // that is not in the workspace after the fetch. When it is not empty the attempt moves to
  // `closing` (cause `skill-missing`) and the answer is `skill-missing`.
  'attempt.bindSession': { input: { session: Required<SessionRef>; seenAt: Instant; missingSkills?: readonly string[] }; output: { kind: 'bound' | 'no-attempt' | 'not-current' /* from `pickCallAttempt` */ | 'skill-missing' } | SessionFault };
  // The owner's wake (../edge/01-api.ts names it `item.wake`). The runner's own wake sources
  // call `requestWake` directly, never this procedure.
  'item.wake': { input: { item: ItemId }; output: { kind: 'requested'; attempt: AttemptId; atcSession: AtcSessionId | null } | { kind: 'not-sleeping' } };
  'item.file': { input: { /* ...the input that the existing procedure has, and */ kind?: ItemKindName; designMode?: DesignMode; labels?: readonly string[]; held?: { reason: string } }; output: { item: ItemId } };
  // Writes an `item.release` lever. Refuses an item whose derived state is not `held`.
  'item.release': { input: { item: ItemId }; output: { kind: 'released'; item: ItemId } | { kind: 'refused'; reason: 'not-held' } };
  'item.retry': { input: { item: ItemId; phase?: PhaseName }; output: { lever: number } };

  // Appends one note. Writes `boxxy.item.noted` with the full text.
  'item.note': { input: { item: ItemId; text: string }; output: { item: ItemId; seq: number } };

  // `boxxy rules dry-run <file>`. `rules` is the text of the rules file: the CLI reads the
  // file and sends it, because the server's own rules are inside its image. The server loads
  // the text with the phase kinds it runs, then calls `dryRunRules`. No write.
  'rules.dryRun': { input: { rules: string }; output: RulesDryRun };

  // The answer names each live attempt the close ended, and how.
  // `of` marks the item a duplicate of another: the same change adds the relation
  // `duplicate-of` from this item to `of`. The reason is then `duplicate`.
  'item.close': { input: { item: ItemId; reason: string; of?: ItemId }; output: { item: ItemId; ended: readonly { attempt: AttemptId; how: 'settled' | 'closing' }[] } };
}

// `recorded` carries `repeat`: true when the same close-out arrived again. `rejected` carries
// the typed problems. A call with no attempt is `refused`, reason `no-attempt`.
export type CloseOutAnswer =
  | { readonly kind: 'recorded'; readonly attempt: AttemptId; readonly factId: FactId; readonly repeat: boolean }
  | { readonly kind: 'rejected'; readonly problems: readonly CloseOutProblem[] }
  | { readonly kind: 'refused'; readonly reason: 'no-attempt' | 'already-closed-out' | 'not-current' };
