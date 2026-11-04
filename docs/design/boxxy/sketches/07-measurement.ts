// 07-measurement.ts: experiments, assignment, exposure, metric and cohort-key plug-ins, the fixed
// estimators, the verdict, shadow runs and promotion.
//
// Package: @boxxy/measurement (modules/measurement), slice 2. Owning docs: measurement.md,
// decision 0006. Slice 1 builds only the cost query these read (02-ports.ts `CostReader`).
//
// Plug-ins: metrics and cohort keys. Fixed in the core, so no experiment can swap them: assignment
// and the exposure fact, one estimator per metric kind, the noise floor, the stop rules, and the
// two experiment types.

import type { ContentHash, DefinitionHash, FactEnvelope, FactMap, Instant, ItemId, ItemKindName, ObservationBoundary, PhaseName, RecipeName, RepoName, RulesVersion } from "./00-core.ts";
import type { PluginRef, Schema } from "./01-registries.ts";
import { defineCohortKey, defineMetric, z } from "./01-registries.ts";
import type { Ask } from "./02-ports.ts";
import type { Pick } from "./04-planning.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// measurement.md writes `verdict("design-phase-v1", { at })`; underneath, the verdict is a pure
// function of the experiment, its items' facts and an analysis date, read up to a boundary.

declare const experiment: LoadedExperiment;
declare const items: readonly ItemFacts[];

export function exampleVerdictCallSite(at: AnalysisDate, boundary: ObservationBoundary): Verdict["status"] {
  return verdict({ experiment, items, at, boundary }).status;
}

// ── Declaration (slice 2; measurement.md "Experiments") ────────────────────────────────────────

export type ExperimentId = string;
export type ArmName = "champion" | "challenger";
export type AnalysisDate = Instant;

/** An experiment file in the rules repo. One champion, one challenger, one phase. Slice 2. */
export type ExperimentDecl = {
  readonly experiment: ExperimentId;
  readonly type: "live-bucket" | "shadow"; // live buckets for recipes; shadow for dispatch rules
  readonly phase: PhaseName;
  readonly arms: { readonly champion: number; readonly challenger: number }; // percent, summing to 100
  readonly challenger: { readonly recipe: `${string}@${number}` } | { readonly rules: RulesVersion };
  readonly cohort: readonly PluginRef[]; // cohort-key plug-ins, by name with their parameters
  readonly metrics: { readonly primary: PluginRef; readonly guards: readonly PluginRef[] }; // metric plug-ins, the same way
  readonly sample: { readonly effect: number; readonly power: number };
  readonly stop: Instant;
};

/** What the loader adds: the derived minimum per arm, and the frozen definition hash. Slice 2. */
export type LoadedExperiment = {
  readonly decl: ExperimentDecl;
  readonly definitionHash: DefinitionHash; // frozen at the first exposure; a change needs a new id
  readonly minPerArm: number; // from effect, power and the champion's measured variance
  readonly challengerRecipe: RecipeName | null;
};

/** The experiment loader's own rejections, beside the rules loader's. Slice 2. */
export type ExperimentRejection =
  | { readonly kind: "unknown-metric" | "unknown-cohort-key"; readonly name: string }
  | { readonly kind: "overlapping-live-buckets"; readonly other: ExperimentId; readonly phase: PhaseName }
  | { readonly kind: "sample-incomplete" } // no effect or no power
  | { readonly kind: "sample-unreachable"; readonly minPerArm: number; readonly expectedByStop: number }
  | { readonly kind: "changed-after-exposure"; readonly frozen: DefinitionHash };

// ── Assignment and exposure (fixed in the core; slice 2) ───────────────────────────────────────

/** `hash(item id, experiment id) mod 100` picks the arm. Deterministic, so a replay gives the same arm. */
export declare function assignArm(item: ItemId, experiment: LoadedExperiment): ArmName;

/** Written in the claim's own transaction. The arm becomes part of the attempt's recipe. Slice 2. */
export type MeasurementFacts = {
  "boxxy.experiment.exposed": {
    readonly experiment: ExperimentId;
    readonly definitionHash: DefinitionHash;
    readonly item: ItemId;
    readonly arm: ArmName;
    readonly phase: PhaseName;
  };
  "boxxy.experiment.shadowed": ShadowRecord;
};

/** A dispatch-rules challenger's picks on the champion's snapshot, after the claim commits, outside the lock. Slice 2. */
export type ShadowRecord = {
  readonly experiment: ExperimentId;
  readonly decision: string; // the champion's decision id
  readonly challengerRules: RulesVersion;
  readonly picks: readonly Pick[]; // acts on nothing
};

// ── Plug-ins (slice 2, verbatim from measurement.md) ───────────────────────────────────────────

/** What a cohort key may read: facts recorded before the item's exposure only. */
export type PreExposureView = {
  readonly item: ItemId;
  readonly kind: ItemKindName;
  readonly repo: RepoName;
  readonly fields: { readonly [k: string]: unknown }; // such as `size` from triage
  readonly links: readonly { readonly type: string; readonly target: ItemId }[];
  readonly exposedAt: Instant;
};

/** Every fact about one exposed item up to the boundary, with helpers a metric reads. */
export type ItemFacts = {
  readonly item: ItemId;
  readonly arm: ArmName;
  readonly exposedAt: Instant;
  readonly facts: readonly FactEnvelope<FactMap>[];
  landedAt(): Instant | null; // the earliest merge of one of its PRs
  spend(unit: "usd" | "tokens"): number; // every attempt, abandoned ones included, joined by agent session id
  abandoned(): boolean;
};

/** Puts an item in a cohort cell. Reads only pre-exposure facts. Slice 2. Owner: measurement.md "Plug-ins". */
export interface CohortKey<P> {
  name: string;
  params: Schema<P>;
  // The loader passes only facts recorded before the exposure fact.
  value(item: PreExposureView, params: P): string;
}

/** Observes one item at an analysis date. Its `kind` picks the fixed estimator. Slice 2. */
export interface Metric<P> {
  name: string;
  kind: "cost" | "time" | "rate"; // picks the estimator: time uses Kaplan-Meier
  unit: "usd" | "tokens" | "minutes" | "ratio";
  params: Schema<P>;
  observe(item: ItemFacts, at: AnalysisDate, params: P): Observation;
}

export type Observation =
  | { state: "done"; value: number }
  | { state: "pending" } // counts toward the pending stop rule
  | { state: "censored"; atLeast: number }; // time metrics only

// Adding a cohort key and a metric is one object each, plus its name in an experiment file.

/** `- field: { name: size }` puts each item in the cell of its `size` field, such as triage's band. */
export const exampleFieldKey = defineCohortKey({
  name: "field",
  params: z.object({ name: z.string() }),
  value: (item, p) => {
    const field = item.fields[p.name];
    return typeof field === "string" ? field : "unknown";
  },
});

export const exampleCostToLand = defineMetric({
  name: "cost-to-land",
  kind: "cost",
  unit: "usd",
  params: z.object({}),
  observe: (item, at) => {
    const landed = item.landedAt();
    return landed !== null && landed <= at ? { state: "done", value: item.spend("usd") } : { state: "pending" };
  },
});

// ── Estimators, floor and stop rules (fixed in the core; slice 2) ──────────────────────────────

/** One estimator per metric kind; becomes a plug-in only when a metric needs one the core lacks. */
export interface Estimator {
  readonly kind: Metric<unknown>["kind"];
  estimate(champion: readonly Observation[], challenger: readonly Observation[]): { readonly effect: number; readonly low: number; readonly high: number };
}

/** The A/A floor: the largest gap between pairs of champion slices, each as wide as the challenger's arm. */
export declare function noiseFloor(champion: readonly Observation[], challengerSize: number, estimator: Estimator): number;

// ── The verdict (slice 2; first cut: one metric, one pooled row, the A/A floor) ────────────────

export type VerdictStatus = "too-few" | "pending" | "early" | "no-call" | "challenger" | "champion";

export type VerdictRow = {
  readonly cell: string; // the cohort cell, or "pooled" for the post-stratified row
  readonly n: { readonly champion: number; readonly challenger: number };
  readonly pending: number;
  readonly abandoned: number;
  readonly effect: number | null; // null below the minimum sample
  readonly interval: readonly [number, number] | null;
  readonly floor: number;
  readonly clears: boolean; // the interval excludes 0 and the effect beats the floor
};

/** Computed, never stored. Writes `verdict.json` and a report as output. Slice 2. */
export type Verdict = {
  readonly experiment: ExperimentId;
  readonly status: VerdictStatus;
  readonly rows: readonly VerdictRow[];
  readonly at: AnalysisDate;
  readonly boundary: ObservationBoundary;
  readonly hash: ContentHash; // the promote ask binds to it
};

/** Pure. Every exposed item stays in its arm's denominator, finished or not. Slice 2. Owner: measurement.md "The verdict". */
export declare function verdict(input: {
  experiment: LoadedExperiment;
  items: readonly ItemFacts[];
  at: AnalysisDate;
  boundary: ObservationBoundary;
}): Verdict;

/** Shadow verdicts report pick agreement and paired proxies, never an outcome metric. Slice 2. */
export type ShadowVerdict = {
  readonly experiment: ExperimentId;
  readonly agreement: number; // share of decisions with the same picks
  readonly proxies: { readonly pickedAgeMinutes: VerdictRow; readonly idleSlotMinutes: VerdictRow };
  readonly hash: ContentHash;
};

/** Promotion: an owner ask whose exact action is this verdict's hash. Nothing promotes itself. Slice 2. */
export type PromotionAsk = Ask & { readonly action: { readonly kind: "experiment.promote"; readonly params: { readonly experiment: ExperimentId; readonly verdict: string } } };
