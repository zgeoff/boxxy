// 04-planning.ts: the planning core. buildFrame runs the plug-ins over the snapshot; decide reads
// the frame and the pools and returns picks; explain reruns both from a decision's recorded inputs.
//
// Package: @boxxy/planning (modules/planning). Owning docs: planning.md, slice-1.md "Planning:
// buildFrame and decide", dispatch.md "Gates fail toward holding", decision 0004.
//
// Slice 1 types, from slice-1.md: Snapshot, buildFrame, Frame, decide, Decision, Pick,
// PlanContext, Signal, Gate, Waiver. Every plug-in kind with parameters is generic over them:
// `params` is a `Schema<P>`, and the plug-in's call takes `P`. Gate takes `params` like Signal, so
// one loader path checks both. decide never names a concept.

import type {
  DecisionId,
  DecisionRow,
  FaultRecord,
  Instant,
  ItemId,
  ItemView,
  LeverRow,
  LinkRow,
  LinkTypeName,
  PhaseName,
  PoolName,
  RulesVersion,
  SnapshotHash,
} from "./00-core.ts";
import type { LoadedRules, Schema } from "./01-registries.ts";
import { defineAdmission, defineGate, defineSignal, z } from "./01-registries.ts";
import type { BurnForecast, CapacityReading } from "./08-capacity.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// claimNext runs both inside the store's write transaction (05-dispatch.ts). With no pick, it
// writes nothing.

export function examplePlanCallSite(snapshot: Snapshot, rules: LoadedRules, now: Instant): Pick | null {
  const frame = buildFrame({ snapshot, rules, now });
  const decision = decide({ frame, pools: [...rules.pools], freeSlots: snapshot.freeSlots });
  return decision.picks[0] ?? null;
}

// ── Names ──────────────────────────────────────────────────────────────────────────────────────

export type SignalName = string; // "oldest", "expedite", "rank"
export type GateName = string; // "defer", "blocked", "pacing"
export type WaiverName = string; // "expedite-lifts-defer"
export type AdmissionName = string;
export type ViewName = string;
/** A signal's name plus its parameters' content hash, so two pools can use one signal with different parameters. */
export type SignalKey = `${SignalName}#${string}`;

// ── The snapshot, the frame and the decision (slice 1, verbatim) ───────────────────────────────

/** What claimNext reads inside the transaction. Slice 1. Owner: slice-1.md "Planning". */
export type Snapshot = {
  storeVersion: number;
  items: ItemView[]; // every item not yet done and not archived, with its derived state at `now`
  links: LinkRow[]; // live links
  levers: LeverRow[]; // live levers: not undone, not expired at `now`
  freeSlots: Record<PoolName, number>;
};
// later: `SnapshotLater` below adds `readings`, the latest capacity reading per source. Slice 2.

/** An open item and the phase it would run next. Propagation reads every one; gates, waivers and the other signals read only `ready` candidates. */
export type FrameItem = ItemView & { readonly phase: PhaseName };

/** Runs every plug-in over the snapshot. Pure. Slice 1. Owner: planning.md "buildFrame and decide". */
export declare function buildFrame(input: { snapshot: Snapshot; rules: LoadedRules; now: Instant }): Frame;

/** What buildFrame returns. Slice 1. */
export type Frame = {
  candidates: FrameItem[]; // open items in state `ready`; decide picks only these
  values: Map<SignalKey, Map<ItemId, number>>; // after propagation; SignalKey = name + parameters
  holds: Map<ItemId, Hold[]>; // gate holds still in force after waivers
  lifted: Map<ItemId, Lift[]>; // holds a waiver lifted, with the waiver's name
  faults: Fault[]; // each plug-in call or propagation line that threw
};
// later: `FrameLater` below adds `poolHolds` (slice 2) and `admissions` (after slice 2).

export type FrameValues = ReadonlyMap<SignalKey, ReadonlyMap<ItemId, number>>;

/** A gate's hold. `until` is when it ends by itself, if it does. */
export type Hold = { readonly gate: GateName; readonly reason: string; readonly until?: Instant };
/** A waiver's lift of one hold. */
export type Lift = { readonly waiver: WaiverName; readonly gate: GateName; readonly reason: string };
export type Fault = FaultRecord;

/** Picks one item per free slot. Pure; never names a concept. Slice 1. Owner: slice-1.md "Planning". */
export declare function decide(input: { frame: Frame; pools: Pool[]; freeSlots: Record<PoolName, number> }): Decision;

export type Decision = {
  picks: Pick[]; // in pool order, then by each pool's `order`
};
// later: `DecisionLater` below adds `unmatched`, which feeds the strand rule. After slice 2.
export type Pick = { item: ItemId; phase: PhaseName; pool: PoolName };

/**
 * A pool as the loader resolves it. The rules file writes `lead` once and `order` per pool; the
 * loader resolves both to signal keys and puts `lead` first in `order`, which is how decide reads
 * `lead` with no `rules` argument. Slice 1. Owner: planning.md "Pools".
 */
export type Pool = {
  readonly name: PoolName;
  readonly slots: number;
  readonly takes: Readonly<Record<string, readonly string[]>>; // filter field -> accepted values
  readonly order: readonly SignalKey[]; // `lead`, then the pool's own `order`; lower first, no value last, then item id
};
// later: `PoolLater` below adds `whenEmpty`, the pool's empty policy.

// ── Plug-in kinds (slice 1: signal, gate, waiver) ──────────────────────────────────────────────

export type PlanContext = {
  now: Instant;
  levers: LeverRow[];
  links: LinkRow[];
  values: FrameValues;
};
// later: `PlanContextLater` below adds `forecasts`, which buildFrame computes from the snapshot's
// readings. Slice 2.

/**
 * Gives an item a sort key. Lower sorts first; null is no opinion. `P` is the type of the
 * parameters its plug-in reference gives it; the loader checks them with `params`. Slice 1. Owner:
 * planning.md "Concepts".
 */
export interface Signal<P> {
  name: SignalName;
  params: Schema<P>; // checked by the loader
  value(item: FrameItem, ctx: PlanContext, params: P): number | null; // null: no opinion
  combine?(a: number, b: number): number; // used when a propagation line carries this signal
}

/** Holds an item off the frontier, with a reason. A gate that throws holds. Slice 1. */
export interface Gate<P> {
  name: GateName;
  liftable: boolean;
  params: Schema<P>; // checked by the loader; slice 1's `defer` takes `z.object({})`
  hold(item: FrameItem, ctx: PlanContext, params: P): Hold | null; // Hold = { gate, reason, until? }
}

/** Lifts one gate's hold on one item. A waiver that throws lifts nothing. Slice 1. */
export interface Waiver {
  name: WaiverName;
  lifts: GateName;
  lift(item: FrameItem, hold: Hold, ctx: PlanContext): Lift | null;
}

// ── Later plug-in kinds ────────────────────────────────────────────────────────────────────────

/** Widens which pools may take an item. An admission that throws admits nothing. Later. */
export interface Admission<P> {
  name: AdmissionName;
  params: Schema<P>;
  admit(item: FrameItem, ctx: PlanContext, params: P): AdmissionGrant | null;
}
export type AdmissionGrant = { readonly admission: AdmissionName; readonly pools: readonly PoolName[] | "any"; readonly reason: string };

/** Holds a whole pool, with a reason. Waivers name it in `lifts` to let one item through. Slice 2 (pacing). */
export interface PoolGate<P> {
  name: GateName;
  liftable: boolean;
  params: Schema<P>;
  hold(pool: Pool, ctx: PlanContextLater, params: P): Hold | null;
}

/** A pure function over the frame, such as explain, forecast or roadmap. Later. Owner: planning.md "Concepts". */
export interface View<I = unknown, O = unknown> {
  name: ViewName;
  render(frame: Frame, input: I): O;
}

/**
 * Carries a signal's value across links of one type. Rules data, not a plug-in: `buildFrame` runs
 * each line, combining values with the signal's `combine`, and stops at an item it has visited.
 * A line that throws carries nothing. Slice 1. Owner: slice-1.md "The slice 1 concepts".
 */
export type PropagationLine = { readonly value: SignalName; readonly over: LinkTypeName; readonly toward: "source" | "target" };

// ── Later extensions of the slice 1 shapes ─────────────────────────────────────────────────────

/** The snapshot with the latest reading per source, read up to the boundary's pepys offsets. Slice 2. */
export type SnapshotLater = Snapshot & { readings: CapacityReading[] };
/** The frame with pool holds (slice 2: pacing; a lift for the item lets it through) and admissions (later). */
export type FrameLater = Frame & { poolHolds: Map<PoolName, Hold[]>; admissions: Map<ItemId, AdmissionGrant[]> };
/** The decision with the candidates with no hold that no pool or admission takes. After slice 2. */
export type DecisionLater = Decision & { unmatched: ItemId[] };
/** A pool with its empty policy. Later. */
export type PoolLater = Pool & { readonly whenEmpty: "idle" };
/** The plan context with each source's burn forecast. Slice 2. */
export type PlanContextLater = PlanContext & { readonly forecasts: readonly BurnForecast[] };

// ── Adding one plug-in of each planning kind ───────────────────────────────────────────────────
// Each `define…` call infers `P` from `params`, so the plug-in's call reads its parameters typed.

/** A signal with parameters: `kind-order: { order: [core.bug, core.issue] }` sorts by the item's kind. */
export const exampleKindOrderSignal = defineSignal({
  name: "kind-order",
  params: z.object({ order: z.array(z.string()) }),
  value: (item, _ctx, p) => {
    const position = p.order.indexOf(item.kind);
    return position === -1 ? null : position;
  },
});

/** Slice 1's `defer` gate: no parameters. */
export const exampleDeferGate = defineGate({
  name: "defer",
  liftable: true,
  params: z.object({}),
  hold: (item, ctx) => {
    // `ctx.levers` holds live levers only, so the latest live defer wins.
    const latest = ctx.levers.filter((l) => l.item === item.id && l.kind === "plan.defer").at(-1);
    if (latest === undefined) return null;
    const reason = latest.reason ?? "deferred";
    if (latest.until === null) return { gate: "defer", reason };
    return latest.until > ctx.now ? { gate: "defer", reason, until: latest.until } : null;
  },
});

/** A gate with parameters: quiet hours hold liftable work in a nightly window. */
export const exampleQuietHoursGate = defineGate({
  name: "quiet-hours",
  liftable: true,
  params: z.object({ startHour: z.number(), endHour: z.number() }),
  hold: (_item, ctx, p) => {
    const hour = Math.floor((ctx.now % 86_400_000) / 3_600_000);
    return hour >= p.startHour || hour < p.endHour ? { gate: "quiet-hours", reason: "inside quiet hours" } : null;
  },
});

/** A waiver: expedite lifts quiet hours, reading the propagated `expedite` value. */
export const exampleExpediteLiftsQuietHours: Waiver = {
  name: "expedite-lifts-quiet-hours",
  lifts: "quiet-hours",
  lift: (item, hold, ctx) => {
    const expedited = [...ctx.values].some(([key, byItem]) => key.startsWith("expedite#") && byItem.has(item.id));
    return expedited ? { waiver: "expedite-lifts-quiet-hours", gate: hold.gate, reason: "expedited" } : null;
  },
};

/** An admission with parameters: items of the named repos may run in any pool. */
export const exampleRepoAnyPool = defineAdmission({
  name: "repo-any-pool",
  params: z.object({ repos: z.array(z.string()) }),
  admit: (item, _ctx, p) => (p.repos.includes(item.repo) ? { admission: "repo-any-pool", pools: "any", reason: `repo ${item.repo}` } : null),
});

/** A view: which candidates each hold keeps back, for `boxxy status`. */
export const exampleHeldView: View<null, ReadonlyMap<string, number>> = {
  name: "held-by-gate",
  render: (frame) => {
    const counts = new Map<string, number>();
    for (const holds of frame.holds.values()) for (const h of holds) counts.set(h.gate, (counts.get(h.gate) ?? 0) + 1);
    return counts;
  },
};

// ── Explain and replay (later; planning.md "Explain", rules.md "Replay CI") ────────────────────

/** Why a candidate lost in one pool. Reasons are computed on demand, never stored. */
export type CandidateOutcome =
  | { readonly kind: "picked" }
  | { readonly kind: "held"; readonly holds: readonly Hold[] }
  | { readonly kind: "filtered" } // the pool's `takes` doesn't match
  | { readonly kind: "earlier-pool"; readonly pool: PoolName } // first match in declared order wins
  | { readonly kind: "outranked"; readonly keys: readonly (number | null)[] }
  | { readonly kind: "pool-held"; readonly holds: readonly Hold[] };

/** What `explain` returns: the decision rebuilt from facts up to its observation boundary. Later. */
export type Explanation = {
  readonly decision: DecisionId | null; // null when no claim was made at that time
  readonly at: Instant;
  readonly rulesVersion: RulesVersion;
  readonly suspect: null | { readonly reason: "snapshot-hash-mismatch" | "missing-pinned-plugin"; readonly detail: string };
  readonly pools: readonly {
    readonly pool: PoolName;
    readonly free: number;
    readonly candidates: readonly { readonly item: ItemId; readonly outcome: CandidateOutcome }[];
  }[];
  readonly faults: readonly Fault[];
};

/** Rebuilds a recorded decision's frame and reruns decide under a rules version. Later. */
export declare function replayDecision(input: {
  decision: DecisionRow;
  snapshot: Snapshot; // rebuilt from facts up to the decision's boundary, never by source time
  rules: LoadedRules; // the recorded version for the determinism test; a PR's version for replay CI
}): {
  readonly snapshotHash: SnapshotHash; // must equal the decision's, or the result is suspect
  readonly picks: readonly Pick[];
  readonly matchesRecorded: boolean;
};
