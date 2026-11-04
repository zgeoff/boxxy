// 05-dispatch.ts: claimNext, the runner tick, reconcile, settle as a strategy per phase kind, the
// mid-flight response rule, triggers, and the stranded-item path to judgement.
//
// Package: @boxxy/dispatch (modules/dispatch); the runner loop that calls it is in @boxxy/server.
// Owning docs: dispatch.md, slice-1.md "claimNext" and "The runner loop", core-model.md "Changes
// while an attempt runs", planning.md "The judgement pool".

import type {
  AttemptId,
  AttemptRow,
  ContentHash,
  CriterionId,
  FactId,
  FactMatch,
  Instant,
  ItemId,
  ItemView,
  JsonValue,
  KnownFailure,
  LiveAttemptState,
  Minutes,
  NewFact,
  ObservationBoundary,
  PhaseName,
  PoolName,
  RecipeHash,
  RunnerId,
} from "./00-core.ts";
import { phaseName } from "./00-core.ts";
import type { Condition, LoadedRules } from "./01-registries.ts";
import type { ClaimStore, NewId, SessionReading, SpawnRequest, StoreChange } from "./02-ports.ts";
import type { CloseOutParse, OpenItem } from "./06-closeouts.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// One runner tick in @boxxy/server: heartbeat, claim until none, start each, reconcile, send facts.

declare function startClaim(claim: Claim): Promise<void>;

export async function exampleTickCallSite(store: ClaimStore, rules: LoadedRules, runner: RunnerId, now: Instant, newId: NewId) {
  await store.exclusive((tx) => tx.writeHeartbeat(runner, now));
  for (let claim = await claimNext({ store, runner, rules, now, newId }); claim; claim = await claimNext({ store, runner, rules, now, newId })) {
    await startClaim(claim); // outside the lock
  }
}

// ── claimNext (slice 1, verbatim) ──────────────────────────────────────────────────────────────

/**
 * Claims at most one item phase, inside one `store.exclusive` call: read the runner, read and hash
 * the snapshot, buildFrame, decide, take both leases, write the attempt, decision row and outbox
 * facts, commit. With no pick it writes nothing. Slice 1. Owner: dispatch.md "claimNext".
 */
export declare function claimNext(input: {
  store: ClaimStore;
  runner: RunnerId;
  rules: LoadedRules;
  now: Instant;
  newId: () => string; // attempt, decision and fact ids, from the app
}): Promise<Claim | null>;

export type Claim = { attempt: AttemptId; item: ItemId; pool: PoolName; slot: number; gen: number; spawn: SpawnRequest };

// ── Reconcile (slice 1; dispatch.md "Unknown outcomes") ────────────────────────────────────────

/**
 * What the runner does with one reading for one attempt state. Besides the action, every `running`
 * or `ended` reading that carries an agent session id the attempt does not hold yet binds it, in the
 * same StoreChange: an `attempt_sessions` row, `boxxy.attempt.session_bound`, and the attempt's
 * `atcSession` set to the atc session that carried it (02-ports.ts `bindSession`). Owner:
 * slice-1.md "Agent sessions".
 */
export type ReconcileAction =
  | { readonly kind: "move-to-running"; readonly fact: "boxxy.attempt.started" | "boxxy.attempt.reconciled" }
  | { readonly kind: "bind-session" } // only the binding above; with nothing new, the cell writes nothing
  | { readonly kind: "settle" } // by the close-out, through the phase kind's settle rule
  | { readonly kind: "fail"; readonly failure: Extract<KnownFailure, "session-lost"> }
  | { readonly kind: "respawn"; readonly giveUpAfter: Minutes; readonly then: Extract<KnownFailure, "spawn-lost"> }; // same request, same idempotency key

/** The reading-by-state table. Every change runs under the attempt's lease generation. Slice 1. */
export type ReconcileTable = { readonly [R in SessionReading["kind"]]: { readonly [S in LiveAttemptState]: ReconcileAction } };

/** slice-1.md's table, as data. A test walks every cell. */
export const reconcileTable: ReconcileTable = {
  running: {
    starting: { kind: "move-to-running", fact: "boxxy.attempt.started" },
    reconciling: { kind: "move-to-running", fact: "boxxy.attempt.reconciled" },
    running: { kind: "bind-session" },
  },
  ended: { starting: { kind: "settle" }, running: { kind: "settle" }, reconciling: { kind: "settle" } },
  absent: {
    starting: { kind: "fail", failure: "session-lost" },
    running: { kind: "fail", failure: "session-lost" },
    reconciling: { kind: "respawn", giveUpAfter: 10, then: "spawn-lost" }, // 10 minutes after the claim
  },
};

/**
 * The heartbeat reaper (proposed, later): when a runner's heartbeats stop for `after`, its live
 * attempts move to `reconciling`. It never releases the item-phase lease: a silent runner doesn't
 * prove the session stopped. Slice 1 runs one runner, which reconciles every live attempt at start.
 */
export type ReaperRule = { readonly after: Minutes };

// ── Settle (slice 1 for build; a strategy per phase kind) ──────────────────────────────────────

/** What a settle rule decides. The core turns it into one StoreChange that also releases both leases. */
export type Settlement = {
  readonly state: "succeeded" | "failed";
  readonly failure: KnownFailure | string | null;
  readonly openItems: readonly OpenItem[]; // filed through dedupe, whatever the result
  readonly criteria: readonly { readonly criterion: CriterionId; readonly evidence: readonly FactId[] }[]; // from the latest valid close-out
  readonly facts: readonly NewFact<"boxxy.proposal.recorded">[]; // friction, as proposals
};

/**
 * Turns a phase's latest close-out into the attempt's end state. Pure. Slice 1 (the build rule);
 * one per phase kind later. Owner: slice-1.md "The runner loop" (settle steps), close-outs.md.
 */
export interface SettleRule<Out = unknown> {
  // `forced`: a reason the runner settles with, which wins over the close-out's state. `openItems`
  // from a valid close-out are still filed.
  settle(input: { attempt: AttemptRow; item: ItemView; closeOut: CloseOutParse<Out> | null; forced: Extract<KnownFailure, "spawn-refused" | "session-lost" | "spawn-lost"> | null; now: Instant }): Settlement;
}

/** Builds the settle StoreChange: the attempt row, both lease releases, `boxxy.attempt.settled`, and the settlement's facts. */
export declare function buildSettleChange(attempt: AttemptRow, settlement: Settlement, now: Instant, newId: NewId): StoreChange;

/**
 * Adding a settle rule for a later phase kind is one object. A triage attempt succeeds whenever its
 * close-out parses: its typed `size` is the outcome, and it files no work itself.
 */
export const exampleTriageSettle: SettleRule<{ size: string; needsDesign: boolean }> = {
  settle: ({ closeOut }) =>
    closeOut?.kind === "valid"
      ? { state: "succeeded", failure: null, openItems: [], criteria: [], facts: [] }
      : { state: "failed", failure: "closeout-missing", openItems: [], criteria: [], facts: [] },
};

// ── Changes while an attempt runs (later; core-model.md "Changes while an attempt runs") ───────

export type MidFlightResponse = "notify" | "restart" | "cancel" | "ignore";

/**
 * What an attempt started from, recorded at claim, so a later fact can be judged against it and
 * review can see work built on a superseded decision. Later.
 */
export type AttemptBasis = {
  readonly itemHash: ContentHash; // the item's fields at claim
  readonly reliesOn: readonly { readonly decision: ItemId; readonly hash: ContentHash }[];
  readonly recipe: RecipeHash;
  readonly readPositions: ObservationBoundary;
  readonly input: JsonValue; // the phase kind's input, such as a rejection reason or a steer
};

/**
 * A rules line: when a fact matching `on` lands for an item with a live attempt, respond. The first
 * matching line wins; with none, the response is `notify`. A response that needs logic names a
 * predicate in `when`. Later.
 */
export type ResponseLine = {
  readonly on: FactMatch; // an answered ask, a superseded decision, a steer, a rank or expedite, a drop, a moved base, a confirmed finding
  readonly phase?: PhaseName;
  readonly when?: Condition;
  readonly respond: MidFlightResponse;
};

export const exampleResponses: readonly ResponseLine[] = [
  { on: { type: "boxxy.item.closed" }, respond: "cancel" },
  { on: { type: "boxxy.decision.superseded" }, phase: phaseName("build"), respond: "restart" },
  { on: { type: "boxxy.lever.recorded", where: { kind: "plan.rank" } }, respond: "ignore" },
];

/** Every response is a fact; boxxy never stops an attempt silently. Later. */
export type DispatchFacts = {
  "boxxy.attempt.responded": { readonly attempt: AttemptId; readonly cause: string; readonly response: MidFlightResponse };
  "boxxy.item.stranded": { readonly item: ItemId; readonly since: Instant; readonly strand: 1 | 2 };
  "boxxy.rules.loaded": { readonly version: string; readonly commit: string }; // later: slice 1 logs reloads
  "boxxy.rules.rejected": { readonly commit: string; readonly rejections: number }; // later: slice 1 logs rejections
};

// ── Triggered phases (later; core-model.md "Phases", merge-train.md) ───────────────────────────

/** A rules line that starts a triggered phase from any state when a fact matches, then hands back. Later. */
export type TriggerLine = {
  readonly phase: PhaseName; // a phase kind with shape `triggered` or `script-first`
  readonly on: FactMatch; // such as a PR behind its base, a conflict, or red CI
  readonly when?: Condition;
};

// ── The stranded-item path (later; planning.md "The judgement pool") ───────────────────────────

/**
 * A ready item that no pool or admission takes for `after` is stranded. The first strand opens a
 * `plan.judge` phase in the one-slot judgement pool; its close-out must end the strand with an
 * override or a defer. A second strand on the same item opens an owner ask. The judgement pool
 * also takes cases no rule covers, such as an attempt over its spend cap. Later.
 */
export type StrandRule = {
  readonly after: Minutes;
  readonly judgePhase: PhaseName; // `plan.judge`
  readonly judgePool: PoolName; // one slot; an owner pull ranks ahead of a judge's pull
  readonly secondStrand: "ask-owner";
};

/** Pure: which unmatched items have crossed the strand time, from decide's `unmatched` and the strand facts. Later. */
export declare function findStranded(input: {
  unmatched: readonly ItemId[];
  unmatchedSince: ReadonlyMap<ItemId, Instant>;
  priorStrands: ReadonlyMap<ItemId, number>;
  rule: StrandRule;
  now: Instant;
}): readonly { readonly item: ItemId; readonly route: "judge" | "ask-owner" }[];
