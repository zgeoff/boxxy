// 01-registries.ts: the plug-in registry, the concept (the one unit that registers plug-ins), the
// item kind, phase kind, link type and fact kind registries, pipelines as data, and the loaded rules.
//
// Package: @boxxy/model (libs/model) holds every type here, `Schema`, and the `define…` helpers,
// because the rules loader, planning and the app all use them. @boxxy/rules (modules/rules) holds
// `loadRules`, which builds the registry and the rules version. Owning docs: rules.md,
// core-model.md "Phases", planning.md "Concepts", slice-1.md "Rules for slice 1".
//
// Two kinds of thing fill the registry. Pure plug-ins (signals, gates, metrics, phase kinds, ...)
// come from concepts, compiled in and pinned by the rules version. Adapters (worker kinds, capacity
// readers, ask channels) do I/O, so the app builds them and passes them in; they never enter a
// concept, and the rules only name them.

import type {
  ConceptPin,
  FactMatch,
  ItemKindName,
  ItemView,
  ItemViewLater,
  JsonValue,
  LeverKind,
  LinkTypeName,
  LoadedRecipe,
  MaxAttemptsByKind,
  PhaseName,
  PipelineName,
  RecipeName,
  RulesVersion,
  SenderKind,
  StreamName,
  WorkerKindName,
} from "./00-core.ts";
import { itemKindName, linkTypeName, phaseName, pipelineName, workerKindName } from "./00-core.ts";
import type { CommandDecl } from "./03-commands.ts";
import type { Admission, FrameItem, Gate, Pool, PoolGate, PropagationLine, Signal, SignalKey, SignalName, View, Waiver } from "./04-planning.ts";
import type { AttemptBasis, ResponseLine, SettleRule, StrandRule, TriggerLine } from "./05-dispatch.ts";
import type { CloseOutParser, TriageCloseOut } from "./06-closeouts.ts";
import type { CohortKey, ExperimentDecl, Metric } from "./07-measurement.ts";
import type { CapacityReader, CapacitySourceKind, SourceDecl } from "./08-capacity.ts";
import type { BatchSizeRule, TrainRules } from "./09-merge-train.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// The server loads a rules checkout over the compiled-in concepts, and every later call (claimNext,
// buildFrame, settle) takes the loaded rules as an argument. The server imports `concepts` and
// `conceptPins` from @boxxy/planning, whose build step generates the pins module, and passes both
// in: @boxxy/rules never imports planning.

declare function loadRules(input: {
  checkout: { path: string; commit: string; files: ReadonlyMap<string, Uint8Array> };
  concepts: readonly Concept[];
  pins: ReadonlyMap<ConceptName, ConceptPin>; // one per concept, from planning's generated module
}): LoadResult;

export function exampleLoadCallSite(files: ReadonlyMap<string, Uint8Array>, concepts: readonly Concept[], conceptPins: ReadonlyMap<ConceptName, ConceptPin>): RulesVersion | null {
  const loaded = loadRules({ checkout: { path: "/rules", commit: "3f2a1c0", files }, concepts, pins: conceptPins });
  return loaded.kind === "loaded" ? loaded.rules.version : null; // on `rejected`, the previous version stays live
}

// ── Schemas ────────────────────────────────────────────────────────────────────────────────────

/**
 * A parameter or payload schema whose output is `T`. A structural stand-in for Standard Schema v1,
 * which zod 4's `ZodType<T>` implements, so these sketches typecheck with no dependency. The real
 * packages use zod.
 */
export type Schema<T> = {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => { readonly value: T } | { readonly issues: readonly { readonly message: string }[] };
  };
};

/** The output type of a schema: zod's `z.output<S>`. */
export type Output<S> = S extends Schema<infer T> ? T : never;

/** The part of zod's builder the examples use. Declared only; the real packages import zod. */
export declare const z: {
  object<S extends { readonly [k: string]: Schema<unknown> }>(shape: S): Schema<{ readonly [K in keyof S]: Output<S[K]> }>;
  string(): Schema<string>;
  number(): Schema<number>;
  boolean(): Schema<boolean>;
  array<T>(item: Schema<T>): Schema<readonly T[]>;
  custom<T>(check?: (value: unknown) => boolean): Schema<T>; // zod's `z.custom<T>()`, for a branded or union type
};

// ── Plug-ins with parameters, and how the registry stores them ─────────────────────────────────

/**
 * Each plug-in kind that takes parameters, by kind name, at parameter type `P`. A plug-in reference
 * in the rules gives a plug-in its parameters; the loader checks them against the plug-in's `params` schema.
 */
export interface ParamKinds<P> {
  signal: Signal<P>; // slice 1
  gate: Gate<P>; // slice 1
  admission: Admission<P>; // declared in slice 1, first plug-in later
  "pool-gate": PoolGate<P>; // slice 2: the pacing gate
  predicate: Predicate<P>; // later
  metric: Metric<P>; // slice 2
  "cohort-key": CohortKey<P>; // slice 2
  "capacity-source": CapacitySourceKind<P>; // slice 2
  "capacity-reader": CapacityReader<P>; // slice 2: an adapter the app passes in, never a concept's
  "batch-size-rule": BatchSizeRule<P>; // later, with the train
}
export type ParamKindName = keyof ParamKinds<unknown>;

/**
 * A plug-in with its parameter type hidden, so plug-ins with different `P` share one map. `open`
 * hands the plug-in back with its own `P`, so the loader checks the rules' parameters with the
 * plug-in's schema and passes the checked value to the same plug-in, with no cast. Slice 1.
 */
export interface Registered<K extends ParamKindName> {
  readonly kind: K;
  readonly name: string;
  open<R>(use: <P>(plugin: ParamKinds<P>[K]) => R): R;
}

/**
 * A plug-in reference after the loader checks it: the plug-in and its parsed parameters, with `P`
 * hidden as in `Registered`. buildFrame calls `open` to run the plug-in with its own parameters. A
 * bare name parses `{}`. `key` is `signalKey(name, params)` for a signal and the name for a gate. Slice 1.
 */
export interface Resolved<K extends ParamKindName> {
  readonly kind: K;
  readonly name: string;
  readonly key: string;
  open<R>(use: <P>(plugin: ParamKinds<P>[K], params: P) => R): R;
}

// One helper per kind. `P` comes from the plug-in's `params` schema at the call, and the result
// erases it. A concept lists the results.
export declare function defineSignal<P>(signal: Signal<P>): Registered<"signal">;
export declare function defineGate<P>(gate: Gate<P>): Registered<"gate">;
export declare function defineAdmission<P>(admission: Admission<P>): Registered<"admission">;
export declare function definePoolGate<P>(gate: PoolGate<P>): Registered<"pool-gate">;
export declare function definePredicate<P>(predicate: Predicate<P>): Registered<"predicate">;
export declare function defineMetric<P>(metric: Metric<P>): Registered<"metric">;
export declare function defineCohortKey<P>(key: CohortKey<P>): Registered<"cohort-key">;
export declare function defineCapacitySource<P>(source: CapacitySourceKind<P>): Registered<"capacity-source">;
export declare function defineCapacityReader<P>(reader: CapacityReader<P>): Registered<"capacity-reader">;
export declare function defineBatchSizeRule<P>(rule: BatchSizeRule<P>): Registered<"batch-size-rule">;

/** How the loader checks a plug-in reference's parameters against a registered signal. Slice 1. */
export function exampleCheckParams(entry: Registered<"signal">, raw: JsonValue): readonly string[] {
  return entry.open((signal) => {
    const checked = signal.params["~standard"].validate(raw);
    return "issues" in checked ? checked.issues.map((issue) => `${signal.name}: ${issue.message}`) : [];
  });
}

// ── The concept ────────────────────────────────────────────────────────────────────────────────

export type ConceptName = string;

/**
 * One module that adds one idea and registers its plug-ins. Slice 1. Owner: planning.md "Concepts",
 * rules.md. `filterFields` is new against slice-1.md: that doc says the `pool` concept defines the
 * filter fields `phase`, `kind` and `repo`, and its interface had no field to hold them.
 */
export interface Concept {
  name: ConceptName; // "pool", "defer" or "expedite"
  version: number; // rules.yaml pins the concept as name@version
  signals?: Registered<"signal">[];
  gates?: Registered<"gate">[];
  waivers?: Waiver[];
  levers?: LeverKind[]; // the lever kinds its commands write
  filterFields?: FilterField[]; // the pool `takes` fields it defines
}
// later: `ConceptLater` below adds admissions, views, predicates, item kinds, link types, phase
// kinds, fact kinds and commands (after slice 2), and pool gates, metrics, cohort keys, capacity
// sources (slice 2), and batch-size rules (with the train).

/** A concept with every later field. */
export interface ConceptLater extends Concept {
  admissions?: Registered<"admission">[];
  poolGates?: Registered<"pool-gate">[];
  views?: View[];
  predicates?: Registered<"predicate">[];
  itemKinds?: ItemKindDecl[];
  linkTypes?: LinkTypeDecl[];
  phaseKinds?: PhaseKind[];
  factKinds?: FactKindDecl[];
  commands?: CommandDecl[];
  metrics?: Registered<"metric">[];
  cohortKeys?: Registered<"cohort-key">[];
  capacitySources?: Registered<"capacity-source">[];
  batchSizeRules?: Registered<"batch-size-rule">[];
}

/** A pool filter field: the value a pool's `takes` matches against. Slice 1. Owner: slice-1.md "The slice 1 concepts". */
export interface FilterField {
  name: string; // "phase", "kind", "repo"; later "area", "project"
  value(item: FrameItem): string | readonly string[] | null; // null never matches a filter on this field
}

/** Slice 1's `repo` filter field, as the `pool` concept registers it. */
export const exampleRepoField: FilterField = { name: "repo", value: (item) => item.repo };

/**
 * A named condition, for a pipeline's `when` and `repeatUntil`, a trigger's `on` or a response
 * line, when a fact match or a close-out field can't say it. Later. Owner: rules.md "a rule that
 * needs conditionals or loops becomes a typed plug-in".
 */
export interface Predicate<P> {
  name: string;
  params: Schema<P>;
  holds(ctx: PredicateContext, params: P): boolean;
}
export type PredicateContext = { readonly item: ItemViewLater; readonly basis: AttemptBasis | null };

// Adding a predicate is one object in a concept, plus its name in a rules line:
export const exampleTouchesPath = definePredicate({
  name: "touches-path",
  params: z.object({ prefix: z.string() }),
  holds: (ctx, p) => {
    const paths = ctx.item.fields["paths"];
    return Array.isArray(paths) && paths.some((path) => typeof path === "string" && path.startsWith(p.prefix));
  },
});

// ── The plug-in kinds registry (rules.md "The plug-in kinds registry") ─────────────────────────

/** Each plug-in kind with no parameters, and the strategy interface its plug-ins implement. */
export interface PlainKinds {
  waiver: Waiver; // slice 1
  "filter-field": FilterField; // slice 1
  lever: { readonly kind: LeverKind }; // slice 1
  view: View; // declared in slice 1, first plug-in later
  "item-kind": ItemKindDecl; // later as a registry entry; slice 1 knows `core.issue` only
  "link-type": LinkTypeDecl; // later; slice 1 knows `blocks` only
  "phase-kind": PhaseKind; // later as a registry entry; slice 1 wires `build` directly
  "fact-kind": FactKindDecl; // later; slice 1's catalog is fixed in @boxxy/model
  command: CommandDecl; // later
}
export type PluginKindName = ParamKindName | keyof PlainKinds;

/**
 * The registry the loader builds from the pinned concepts. Every lookup is by name; a rules line
 * that names a plug-in no concept registers fails the load. Slice 1. Owner: rules.md.
 */
export type Registry = { readonly [K in ParamKindName]: ReadonlyMap<string, Registered<K>> } & {
  readonly [K in keyof PlainKinds]: ReadonlyMap<string, PlainKinds[K]>;
} & { readonly pins: readonly ConceptPin[] };

// ── Item kinds (later as registry entries; core-model.md "Items") ──────────────────────────────

/** An item kind as a concept declares it: its name and typed fields. Free tags are refused. Later. */
export interface ItemKindDecl<F = unknown> {
  name: ItemKindName; // core.issue, core.idea, core.finding, core.decision, core.prevention, core.task
  fields: Schema<F>; // such as trigger, area, size
  freezesWhenDone?: boolean; // core.decision: change course by filing one that `supersedes` it
}

/** What the rules give an item kind. Slice 1. A pipeline step holds the phase's `maxAttempts`. */
export type KindRules = {
  readonly pipeline: Pipeline; // the kind's default; a project or an item may override it (later)
  readonly recipes: Readonly<Record<PhaseName, RecipeName>>;
};

// ── Pipelines as data (slice 1 has one step; core-model.md "Pipelines as data") ────────────────

export type Pipeline = { readonly name: PipelineName; readonly steps: readonly PipelineStep[] };

/**
 * One step of a pipeline. Slice 1's `pipeline: [build]` with `maxAttempts: { build: 2 }` is the
 * short form of `[{ phase: build, maxAttempts: 2 }]`.
 */
export type PipelineStep = {
  readonly phase: PhaseName;
  readonly maxAttempts: number; // failed attempts before the item waits ("attempts used up")
};
// later: `PipelineStepLater` below adds `when`, `repeatUntil` and `signOff`. After slice 2.

/** A step that runs only `when` a condition holds, repeats until one holds, or is a gate. Later. */
export type PipelineStepLater = PipelineStep & {
  readonly when?: Condition; // run the step only when this holds, such as design when triage asks
  readonly repeatUntil?: Condition; // start the step again until this holds, such as review → build
  readonly signOff?: SignOffRule; // present only on a gate step
};
export type PipelineLater = { readonly name: PipelineName; readonly steps: readonly PipelineStepLater[] };

/**
 * A condition in a rules file. Data only: a close-out field, a fact, or a named predicate. Rules
 * files hold no `and`, `or` or `not`; a condition that needs them becomes a predicate plug-in.
 */
export type Condition =
  | { readonly closeOut: { readonly phase: PhaseName; readonly field: string; readonly equals: JsonValue } }
  | { readonly fact: FactMatch } // a matching fact landed since the step began
  | { readonly predicate: string; readonly params?: JsonValue };

/** Who may sign off at a gate step, and what a rejection does. Later. Owner: core-model.md "Gates and sign-offs". */
export type SignOffRule = {
  readonly bindsTo: "draft-hash"; // the sign-off fact must name the exact draft hash
  readonly signers: readonly SenderKind[];
  readonly ownerMaySkip: boolean; // whether the owner's override can pass the gate
  readonly onReject: PhaseName; // the item goes back here, with the reason as input
};

/** The pipeline below signs off an interface before anyone designs against it. */
export const exampleContractFirst: PipelineLater = {
  name: pipelineName("contract-first"),
  steps: [
    { phase: phaseName("contract"), maxAttempts: 2 },
    {
      phase: phaseName("sign-off"),
      maxAttempts: 1,
      signOff: { bindsTo: "draft-hash", signers: ["owner"], ownerMaySkip: false, onReject: phaseName("contract") },
    },
    { phase: phaseName("design"), maxAttempts: 2 },
    { phase: phaseName("build"), maxAttempts: 2 },
    { phase: phaseName("review"), maxAttempts: 3, repeatUntil: { closeOut: { phase: phaseName("review"), field: "check", equals: "pass" } } },
  ],
};

// ── Phase kinds (slice 1 wires `build`; registry entries later; core-model.md "Phases") ────────

/** The four shapes of phase, plus the gate. */
export type PhaseShape =
  | { readonly shape: "pipeline" }
  | { readonly shape: "triggered" } // starts from any state when a trigger line's `on` matches, then hands back
  | { readonly shape: "attended" } // the owner is in the session; runners never claim it
  | { readonly shape: "script-first"; readonly agentPhase: PhaseName; readonly agentOn: readonly string[] } // outcomes the script can't handle
  | { readonly shape: "gate" }; // an ask whose answer is the outcome; no worker

/**
 * A phase kind: its input, the worker kind that runs it, its close-out schema and its settle rule.
 * Slice 1 builds `build` only, wired directly; the registry entry is later. Owner: core-model.md "Phases".
 */
export interface PhaseKind<Input = unknown, Out = unknown> {
  name: PhaseName;
  shape: PhaseShape;
  worker: WorkerKindName | null; // null for a gate
  input(item: ItemView, basis: AttemptBasis): Input; // pure: what the attempt starts from
  closeOut: CloseOutParser<Out>; // an attempt whose close-out doesn't parse fails (06-closeouts.ts)
  settle: SettleRule<Out>; // the outcome's effect on the item (05-dispatch.ts)
}

/** Adding a phase kind: triage, with its parser and its settle rule, run by the atc worker. */
declare const triageParser: CloseOutParser<TriageCloseOut>;
export const exampleTriagePhase: PhaseKind<{ title: string; outcome: string }, TriageCloseOut> = {
  name: phaseName("triage"),
  shape: { shape: "pipeline" },
  worker: workerKindName("atc.session"),
  input: (item) => ({ title: item.title, outcome: item.outcome }),
  closeOut: triageParser,
  settle: {
    settle: ({ closeOut }) =>
      closeOut?.kind === "valid"
        ? { state: "succeeded", failure: null, openItems: [], criteria: [], friction: closeOut.closeOut.friction, frictionDropped: 0 }
        : { state: "failed", failure: "closeout-missing", openItems: [], criteria: [], friction: [], frictionDropped: 0 },
  },
};

// ── Link types (later as registry entries; core-model.md "Links") ──────────────────────────────

/** A link type. Only `blocking` types feed readiness. Later. */
export interface LinkTypeDecl {
  name: LinkTypeName; // blocks, parent, supersedes, found-in, designs, prevents, relies-on, serves
  blocking: boolean; // true: the target can't be ready until the source is done
  acyclic: boolean; // the store refuses a link that closes a cycle
  from: readonly ItemKindName[] | "any";
  to: readonly ItemKindName[] | "any";
}

// ── Fact kinds (later as registry entries; architecture.md principle 6) ────────────────────────

/** A fact kind: its stream, schema and its one write path. Later; slice 1's catalog is fixed. */
export interface FactKindDecl<P = unknown> {
  type: string; // "boxxy.attempt.responded"
  stream: StreamName;
  schema: Schema<P>;
  writePath: string; // the one function that writes it, which every flow that sees the fact calls
}

// ── Adding one item kind and link type, as one concept ─────────────────────────────────────────

export const exampleFindingsConcept: ConceptLater = {
  name: "findings",
  version: 1,
  itemKinds: [{ name: itemKindName("core.finding"), fields: z.object({ lens: z.string(), rule: z.string() }) }],
  linkTypes: [{ name: linkTypeName("found-in"), blocking: false, acyclic: true, from: [itemKindName("core.finding")], to: "any" }],
};

// ── The rules file and the loaded rules (slice 1, slice-1.md "Rules for slice 1") ──────────────

/**
 * A concept pin in `rules.yaml`: `- pool@1`. Slice 1 concepts take no parameters; in slice 1,
 * parameters live only on plug-ins, through plug-in references. Slice 1.
 */
export type ConceptEntry = `${string}@${number}`;
// later: concept parameters. A concept entry may be a one-key map, `- defer@1: { maxDays: 30 }`.
// The concept becomes `Concept<P>` with `params: Schema<P>`, registered through a `defineConcept`
// helper that hides P as `Registered` does. The loader checks the entry against `params` and
// rejects a failure as `bad-concept-params`. The checked value reaches the concept's plug-ins as a
// field of the plugin context, such as `ctx.concept`, never through their own `params`. After slice 2.

/**
 * A plug-in reference: how the rules name a plug-in. A bare name takes no parameters; a one-key map
 * gives the name its parameters, checked against the plug-in's `params`. Signals in `order` and
 * `lead`: `order: [oldest, { kind-order: { order: [chore, bug] } }]`. Slice 1.
 */
export type PluginRef = string | { readonly [name: string]: JsonValue };

/** A signal named in a pool's `order` or in `lead`. */
export type SignalRef = SignalName | { readonly [name: string]: JsonValue };

/** `rules.yaml` as parsed, before the loader checks it. Slice 1. */
export type RulesFile = {
  readonly version: 1;
  readonly concepts: readonly ConceptEntry[];
  readonly kinds: Readonly<
    Record<string, { readonly pipeline: readonly string[] | PipelineName; readonly maxAttempts: Readonly<Record<string, number>>; readonly recipes: Readonly<Record<string, string>> }>
  >;
  readonly pools: readonly {
    readonly name: string;
    readonly slots: number;
    readonly takes: { readonly [field: string]: JsonValue };
    readonly order: readonly SignalRef[];
  }[];
  readonly lead: readonly SignalRef[]; // signals every pool sorts by before its own order
  readonly propagation: readonly { readonly value: string; readonly over: string; readonly toward: "source" | "target" }[];
  readonly recipes: Readonly<Record<string, { readonly agent: string; readonly model: string; readonly effort: string; readonly prompt: string; readonly source: string }>>;
};
// later: `RulesFileLater` below adds `pipelines`, `triggers`, `responses`, `stranded` (after
// slice 2), `sources` (slice 2) and `train` (with the train).

export type RulesFileLater = RulesFile & {
  readonly pools: readonly { readonly when_empty?: "idle" }[]; // a pool's empty policy; later
  readonly pipelines?: Readonly<Record<string, readonly (string | { readonly [phase: string]: JsonValue })[]>>;
  readonly triggers?: readonly JsonValue[];
  readonly responses?: readonly JsonValue[];
  readonly stranded?: JsonValue;
  readonly sources?: readonly JsonValue[];
  readonly train?: JsonValue;
};

/**
 * What every pure call takes. buildFrame gets its plug-ins from `signals`, `gates` and `registry`,
 * which the loader builds from the pinned concepts, so no call takes a registry beside the rules.
 * Every gate and waiver of a pinned concept runs: `rules.yaml` lists no gates, and the loader checks
 * each gate's parameters as `{}`. Slice 1.
 *
 * Reload: the server checks the checkout's commit each tick. A new commit loads into a new
 * LoadedRules; on `loaded` the next claim uses it, and on `rejected` the previous version stays live
 * and `runner.status` shows the rejection. A checkout with uncommitted changes is rejected whole.
 * Slot rows follow each loaded version (slice-1.md "Store rules"). Owner: slice-1.md "Rules for slice 1".
 */
export type LoadedRules = {
  readonly version: RulesVersion;
  readonly commit: string;
  readonly registry: Registry;
  readonly signals: ReadonlyMap<SignalKey, Resolved<"signal">>; // every key a pool's `order` or a propagation line names
  readonly gates: readonly Resolved<"gate">[];
  readonly kinds: ReadonlyMap<ItemKindName, KindRules>;
  readonly maxAttemptsByKind: MaxAttemptsByKind; // from `kinds`, for the store readers
  readonly pools: readonly Pool[]; // in declared order; each pool's `order` already starts with `lead`
  readonly propagation: readonly PropagationLine[];
  readonly recipes: ReadonlyMap<RecipeName, LoadedRecipe>;
};
// later: `LoadedRulesLater` below adds `triggers`, `responses` and `strand` (after slice 2),
// `experiments` and `sources` (slice 2), and `train` (with the train).

export type LoadedRulesLater = LoadedRules & {
  readonly triggers?: readonly TriggerLine[];
  readonly responses?: readonly ResponseLine[];
  readonly strand?: StrandRule;
  readonly experiments?: readonly ExperimentDecl[];
  readonly sources?: readonly SourceDecl[];
  readonly train?: TrainRules;
};

/** One loader rejection, with the file, the path in the file and the reason. Slice 1. */
export type LoadRejection = { readonly file: string; readonly path: string; readonly reason: LoadRejectionReason };

export type LoadRejectionReason =
  | { readonly kind: "invalid"; readonly message: string } // the YAML doesn't parse, or the file fails the `RulesFile` schema
  | { readonly kind: "unknown-concept"; readonly ref: string }
  | { readonly kind: "unknown-signal"; readonly signal: string } // in a pool's `order` or in `lead`
  | { readonly kind: "bad-plugin-params"; readonly pluginKind: ParamKindName; readonly name: string; readonly message: string } // the plug-in's `params` refused the plug-in reference's parameters
  | { readonly kind: "unknown-link-type"; readonly link: string } // in a propagation line
  | { readonly kind: "signal-without-combine"; readonly signal: string } // a propagation line's signal
  | { readonly kind: "missing-recipe"; readonly itemKind: string; readonly phase: string } // a pipeline phase with no recipe
  | { readonly kind: "missing-prompt"; readonly path: string }
  | { readonly kind: "uncommitted-changes" } // the server checks git and returns this; loadRules never does
  | { readonly kind: "unknown-plugin"; readonly pluginKind: PluginKindName; readonly name: string } // later
  | { readonly kind: "experiment"; readonly message: string }; // later: the experiment loader's own checks

export type LoadResult =
  | { readonly kind: "loaded"; readonly rules: LoadedRules; readonly warnings: readonly string[] } // such as overlapping pool filters (proposed)
  | { readonly kind: "rejected"; readonly rejections: readonly LoadRejection[] };
