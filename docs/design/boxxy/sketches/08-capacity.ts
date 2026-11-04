// 08-capacity.ts: capacity sources (unit, reset, reader), readings as facts, the router, the
// pacing gate, and spend caps per phase and model.
//
// Package: @boxxy/capacity (modules/capacity), slice 2; each reader is an adapter named
// `capacity-<provider>`. Owning docs: capacity.md, decision 0008. The whole design is proposed.
//
// A source kind is a pure plug-in: its unit and reset rule. A reader is an adapter: it does I/O
// and turns a provider's answer into a reading fact. decide reads capacity only through those
// facts, so a replay sees the reading dispatch saw.

import type { AttemptId, Instant, ModelChoice, ModelRole, PhaseName, PoolName, RecipeHash, SourceName } from "./00-core.ts";
import type { ResolvedRecipe } from "./00-core.ts";
import type { PluginRef, Registered, Schema } from "./01-registries.ts";
import { defineCapacitySource, definePoolGate, z } from "./01-registries.ts";
import type { SnapshotLater } from "./04-planning.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// At claim time, inside the transaction, the router picks a source for the attempt from the
// latest readings, and writes `boxxy.attempt.routed`, so spend joins to its source through the attempt.

declare const router: Router;

export function exampleRouteCallSite(recipe: ResolvedRecipe, snapshot: SnapshotLater, sources: readonly SourceDecl[], now: Instant): SourceName | null {
  const choice = router.pick({ recipe, readings: snapshot.readings, sources, now }); // readings come from the snapshot, so replay sees them
  return choice.kind === "routed" ? choice.source : null;
}

// ── Sources (slice 2; capacity.md "Capacity sources") ──────────────────────────────────────────

/** The unit a source counts in. */
export type CapacityUnit =
  | { readonly kind: "window-percent"; readonly windows: readonly string[] } // percent of each usage window used
  | { readonly kind: "money"; readonly currency: "usd" }; // credit balance and spend

/** When a source refills. */
export type ResetRule =
  | { readonly kind: "window-end" } // the reading carries each window's reset time
  | { readonly kind: "top-up" }; // none until someone adds credit

/** A source kind: pure. Slice 2. Owner: capacity.md "Capacity sources". */
export interface CapacitySourceKind<P> {
  name: string; // "subscription-window", "pay-per-token"
  unit: CapacityUnit;
  reset: ResetRule;
  params: Schema<P>;
  /** What is left before the next reset, in the unit's own terms, as a share from 0 to 1. */
  remaining(reading: CapacityReading, params: P): number;
}

/** A source in the rules: one account and one model class, so a reading for one class never stands in for another. */
export type SourceDecl = {
  readonly name: SourceName;
  readonly kind: PluginRef; // a CapacitySourceKind name, with its parameters
  readonly reader: PluginRef; // the adapter, such as `capacity-<provider>`, with its parameters
  readonly serves: readonly ModelChoice[];
  readonly reserve: number; // share kept free for the owner's own sessions
};

/** One reading, written as a fact on the capacity stream. Slice 2. */
export type CapacityReading = {
  readonly source: SourceName;
  readonly at: Instant;
  readonly windows?: readonly { readonly name: string; readonly usedPercent: number; readonly resetsAt: Instant }[];
  readonly balance?: { readonly usd: number; readonly spentUsd: number };
};

/** Reads one source from its provider: response headers or a billing API. An adapter. Slice 2. */
export interface CapacityReader<P> {
  readonly name: string; // `capacity-<provider>`
  readonly params: Schema<P>; // the source's `reader` line, such as which usage windows to read
  read(source: SourceName, now: Instant, params: P): Promise<CapacityReading | { readonly kind: "unknown"; readonly reason: string }>;
}

export type CapacityFacts = {
  "boxxy.capacity.read": CapacityReading;
  "boxxy.attempt.routed": { readonly attempt: AttemptId; readonly source: SourceName; readonly recipe: RecipeHash };
  "boxxy.attempt.over_cap": { readonly attempt: AttemptId; readonly role: ModelRole; readonly spent: number; readonly limit: number };
};

// Adding a source kind is one object; its reader is one adapter package.
/** `kind: { pay-per-token: { floorUsd: 20 } }` counts a balance at or under the floor as empty. */
export const examplePayPerToken = defineCapacitySource({
  name: "pay-per-token",
  unit: { kind: "money", currency: "usd" },
  reset: { kind: "top-up" },
  params: z.object({ floorUsd: z.number() }),
  remaining: (r, p) => (r.balance ? Math.max(r.balance.usd - p.floorUsd, 0) / Math.max(r.balance.usd + r.balance.spentUsd, 1) : 0),
});

// ── The router (slice 2; capacity.md "Models and the router") ──────────────────────────────────

/**
 * Picks a source for one attempt among those that serve the recipe's model through its provider.
 * Routing among them never confounds an experiment, so it is free to balance load. A model or
 * provider swap changes the recipe, so it is an experiment arm, never a routing choice. Pure;
 * one implementation in the core, not a plug-in kind. Slice 2.
 */
export interface Router {
  pick(input: {
    recipe: ResolvedRecipe;
    readings: readonly CapacityReading[];
    sources: readonly SourceDecl[];
    now: Instant;
  }): { readonly kind: "routed"; readonly source: SourceName } | { readonly kind: "none"; readonly reason: string };
}

// ── The pacing gate (slice 2; capacity.md "The pacing gate") ───────────────────────────────────

/** Per source: queued demand, by each phase's measured model mix, against what is left before reset. */
export type BurnForecast = {
  readonly source: SourceName;
  readonly remaining: number;
  readonly demandUntilReset: number;
  readonly runsOutAt: Instant | null;
  readonly resetsAt: Instant | null;
};

/**
 * Pure: per source, queued demand times each phase's measured model mix, against what each reading
 * leaves before its reset. buildFrame calls it and puts the result on `PlanContextLater.forecasts`.
 * Slice 2.
 */
export declare function forecastBurn(input: {
  readings: readonly CapacityReading[];
  kinds: ReadonlyMap<string, Registered<"capacity-source">>;
  queued: readonly { readonly phase: PhaseName; readonly recipe: RecipeHash }[];
  modelMix: ReadonlyMap<PhaseName, ReadonlyMap<ModelRole, number>>; // measured spend share per role
  now: Instant;
}): readonly BurnForecast[];

/**
 * The pacing gate holds lower-priority pools when a source's forecast runs out before its reset,
 * and holds before the owner's reserve. It is a pool gate, because it holds pools, not items;
 * expedite is its waiver, and a pacing plug-in that throws holds. Slice 2.
 */
export const examplePacingGate = definePoolGate({
  name: "pacing",
  liftable: true,
  params: z.object({ protect: z.array(z.custom<PoolName>()) }), // static rules data; live readings come through ctx
  hold: (pool, ctx, p) => {
    if (p.protect.includes(pool.name)) return null;
    const short = ctx.forecasts.find((f) => f.runsOutAt !== null && f.resetsAt !== null && f.runsOutAt < f.resetsAt);
    return short ? { gate: "pacing", reason: `source ${short.source} runs out before its reset` } : null;
  },
});

// ── Caps per phase and model (slice 2; capacity.md "Caps per phase and model") ─────────────────

/**
 * A recipe sets a cap per phase and model role. An attempt over a cap stops, settles as failed
 * with `over-cap`, and goes to the judgement pool. Slice 2.
 */
export type SpendCap = {
  readonly phase: PhaseName;
  readonly role: ModelRole;
  readonly limit: { readonly usd: number } | { readonly tokens: number };
};

/** Pure: compares an attempt's spend so far, from request facts joined by the attempt's agent session ids, with its caps. Slice 2. */
export declare function checkCaps(spent: ReadonlyMap<ModelRole, { readonly usd: number; readonly tokens: number }>, caps: readonly SpendCap[]): readonly SpendCap[];

// ── One unit for comparison (slice 2; capacity.md "One unit for comparison") ───────────────────

/** Money per landed change: a subscription's fee spread over what it landed; a provider's billed cost, never the agent's estimate. */
export type CostRule = { readonly kind: "subscription"; readonly feePerPeriodUsd: number; readonly periodDays: number } | { readonly kind: "billed" };
