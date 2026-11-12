import type { JsonValue } from '@boxxy/content-hash';
import type { z } from 'zod';
import type { CloseOutParser, Effect } from '../closeouts/types.ts';
import type { RetryLever, RulesHoldReason } from '../pipeline/types.ts';
import type {
  Admission,
  FrameItem,
  Gate,
  Limit,
  Pool,
  PropagationLine,
  Signal,
  SignalKey,
  SignalName,
  View,
  Waiver,
} from '../planning/types.ts';
import type { JobAction, MergeMethod } from '../ports/types.ts';
import type {
  AttemptId,
  AttemptRow,
  CommitSha,
  ConceptPin,
  EngineOutcome,
  Instant,
  ItemKindName,
  ItemView,
  LeverKind,
  Minutes,
  PhaseName,
  PipelineName,
  PullRequestRow,
  RecipeMaterial,
  RecipeName,
  RelationTypeName,
  RulesVersion,
  SessionMode,
  WorkerKindName,
} from '../types.ts';

export type Schema<T> = z.ZodType<T>;

export interface ParamKinds<P> {
  signal: Signal<P>;
  gate: Gate<P>;
  admission: Admission<P>;
}

export type ParamKindName = keyof ParamKinds<unknown>;

export interface Registered<K extends ParamKindName> {
  readonly kind: K;
  readonly name: string;
  open: <R>(use: <P>(plugin: ParamKinds<P>[K]) => R) => R;
}

export interface Resolved<K extends ParamKindName> {
  readonly kind: K;
  readonly name: string;

  // `signalKey(name, params)` for a signal, and the name for a gate
  readonly key: string;
  open: <R>(use: <P>(plugin: ParamKinds<P>[K], params: P) => R) => R;
}

export type ConceptName = string;

export interface Concept {
  name: ConceptName;
  version: number;
  signals?: Registered<'signal'>[];
  gates?: Registered<'gate'>[];
  waivers?: Waiver[];
  levers?: LeverKind[];
  filterFields?: FilterField[];
}

export interface FilterField {
  name: string;

  // null never matches a filter on this field
  value: (item: FrameItem) => string | readonly string[] | null;
}

export interface PlainKinds {
  waiver: Waiver;
  'filter-field': FilterField;
  lever: { readonly kind: LeverKind };
  view: View;
}

export type PluginKindName = ParamKindName | keyof PlainKinds;

export type Registry = { readonly [K in ParamKindName]: ReadonlyMap<string, Registered<K>> } & {
  readonly [K in keyof PlainKinds]: ReadonlyMap<string, PlainKinds[K]>;
} & { readonly pins: readonly ConceptPin[] };

// The code of one phase. Its `outcomes` are the one list of the phase's outcome names: the
// loader checks the rules against it, and `settle` answers with one of them.
export interface PhaseKind<
  Body = unknown,
  Input extends JsonValue = JsonValue,
  Outcomes extends readonly string[] = readonly string[],
> {
  readonly name: PhaseName;
  readonly version: number;
  readonly worker: WorkerKindName;
  readonly outcomes: Outcomes;
  readonly needsAcceptance: boolean;

  // the session mode of an attempt of this phase; agent when the kind sets none
  readonly mode?: (item: ItemView) => SessionMode;
  readonly input: (ctx: PhaseInputContext) => Input;
  readonly closeOut: CloseOutParser<Body>;

  // Called only with the attempt's valid close-out. A method's parameter is bivariant, so a
  // phase kind of any body still fits `PhaseKind`; a plain function property would refuse it.
  readonly settle: BivariantSettle<Body, Outcomes[number]>['settle'];

  // a phase kind on a job worker: pure, called on each read of a running job
  readonly drive?: (ctx: DriveContext) => JobStep;
}

export interface DriveContext {
  readonly observed: JsonValue;
  readonly attempt: AttemptRow;
  readonly deadlinePassed: boolean;
  readonly rules: LoadedRules;
  readonly now: Instant;

  // an action with no answer is sent again only this long after it was marked
  readonly actRetryMinutes: number;
}

// `wait`: `item get` shows the reason. `finish`: the runner records the close-out as the
// attempt's, and the attempt settles by the normal path.
export type JobStep =
  | { readonly kind: 'wait'; readonly reason: string; readonly pending: readonly string[] }
  | { readonly kind: 'act'; readonly action: JobAction }
  | { readonly kind: 'finish'; readonly closeOut: JsonValue };

interface BivariantSettle<Body, Outcome extends string> {
  // oxlint-disable-next-line typescript/method-signature-style -- the method form is what makes the parameter bivariant
  settle(input: SettleInput<Body>): Settlement<Outcome>;
}

export interface PhaseInputContext {
  readonly item: ItemView;

  // the attempt that the claim makes
  readonly attempt: AttemptId;

  // the item's attempts, oldest first
  readonly history: readonly AttemptRow[];

  // the item's `item.retry` levers, oldest first
  readonly retries: readonly RetryLever[];
  readonly pullRequests: readonly PullRequestRow[];

  // the `session` field of the claim's recipe; null when the recipe sets none
  readonly session: 'builder' | 'fresh' | null;
}

export interface SettleInput<Body> {
  readonly attempt: AttemptRow;
  readonly item: ItemView;
  readonly closeOut: Body;
  readonly now: Instant;
}

export interface Settlement<Outcome extends string = string> {
  readonly state: 'succeeded' | 'failed';
  readonly failure: string | null;
  readonly outcome: Outcome;
  readonly effects: readonly Effect[];
  readonly frictionDropped: number;
}

export interface KindRules {
  readonly pipeline: Pipeline;

  // by phase, and by `<phase>/attended` for an attended session of the phase
  readonly recipes: Readonly<Record<string, RecipeName>>;
}

export interface Pipeline {
  readonly name: PipelineName;
  readonly steps: readonly PipelineStep[];
}

export interface PipelineStep {
  readonly phase: PhaseName;

  // attempts in a row that ended `lost` or took an `again` edge
  readonly maxAttempts: number;

  // the clock of one stretch of running of an agent-mode attempt
  readonly timeoutMinutes: Minutes;

  // an entry for every outcome of the phase kind
  readonly on: Readonly<Record<string, Edge>>;
}

export type Edge =
  | 'next'
  | 'again'
  | { readonly to: PhaseName; readonly max?: number; readonly resume?: boolean }
  | { readonly end: string }
  | { readonly hold: RulesHoldReason };

export interface SkillsPin {
  // the repository, as owner/name
  readonly source: string;
  readonly ref: CommitSha;
}

// A relation type is registry data: the rules file lists the names, and a new type needs no code.
export interface RelationType {
  readonly name: RelationTypeName;
}

export interface SleepRules {
  readonly afterIdleMinutes: Minutes;
  readonly afterQuietMinutes: Minutes;
  readonly afterUnattendedMinutes: Minutes;
}

export type ConceptEntry = `${string}@${number}`;

export type PluginRef = string | Readonly<Record<string, JsonValue>>;

export type SignalRef = SignalName | Readonly<Record<string, JsonValue>>;

// What an item's position and state read of the rules loaded now; a `LoadedRules` is one.
export interface ItemRules {
  readonly kinds: ReadonlyMap<ItemKindName, { readonly pipeline: Pipeline }>;
  readonly phases: ReadonlyMap<PhaseName, { readonly needsAcceptance: boolean }>;
}

export interface LoadedRules {
  readonly version: RulesVersion;
  readonly commit: string;
  readonly registry: Registry;
  readonly signals: ReadonlyMap<SignalKey, Resolved<'signal'>>;
  readonly gates: readonly Resolved<'gate'>[];
  readonly kinds: ReadonlyMap<ItemKindName, KindRules>;
  readonly phases: ReadonlyMap<PhaseName, PhaseKind>;
  readonly limits: readonly Limit[];

  // in declared order, each pool's `order` starting with `lead`
  readonly pools: readonly Pool[];
  readonly propagation: readonly PropagationLine[];
  readonly recipes: ReadonlyMap<RecipeName, RecipeMaterial>;
  readonly sleep: SleepRules;

  // null when the rules file has no `skills` block
  readonly skills: SkillsPin | null;
  readonly relationTypes: ReadonlyMap<RelationTypeName, RelationType>;

  // null when the rules file has no `merge` block
  readonly merge: MergeRules | null;
}

export interface MergeRules {
  readonly method: MergeMethod;

  // Check names that must conclude `success` at the head. boxxy reads the union of this list and
  // the base branch's required status checks, so the loader refuses an empty list.
  readonly checks: readonly string[];
}

export interface LoadRejection {
  readonly file: string;
  readonly path: string;
  readonly reason: LoadRejectionReason;
}

export type LoadRejectionReason =
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unknown-concept'; readonly ref: string }
  | { readonly kind: 'unknown-signal'; readonly signal: string }
  | {
      readonly kind: 'bad-plugin-params';
      readonly pluginKind: ParamKindName;
      readonly name: string;
      readonly message: string;
    }
  | { readonly kind: 'unknown-relation-type'; readonly relation: string }
  | { readonly kind: 'signal-without-combine'; readonly signal: string }
  | { readonly kind: 'missing-recipe'; readonly itemKind: string; readonly phase: string }
  | { readonly kind: 'missing-prompt'; readonly path: string }

  // the prompt template does not parse, uses a tag or filter off the list, names a value that is
  // no placeholder or reads a name from a value, loops over anything but a bare placeholder,
  // builds a range, or reads a field of any value
  | { readonly kind: 'bad-prompt'; readonly path: string; readonly message: string }
  | { readonly kind: 'uncommitted-changes' }

  // a limit's `counts` or a pool's `takes` names a field that no concept registers
  | { readonly kind: 'unknown-filter-field'; readonly field: string }

  // a pool can take an item that no limit counts, so its picks would have no bound
  | { readonly kind: 'pool-without-limit'; readonly pool: string }
  | { readonly kind: 'unknown-phase'; readonly phase: string }
  | { readonly kind: 'unmapped-outcome'; readonly phase: PhaseName; readonly outcome: string }
  | { readonly kind: 'unknown-outcome'; readonly phase: PhaseName; readonly outcome: string }
  | { readonly kind: 'open-loop'; readonly phase: PhaseName; readonly outcome: string }
  | { readonly kind: 'edge-to-unknown-phase'; readonly phase: PhaseName; readonly to: string }
  | {
      readonly kind: 'step-without-recipe';
      readonly itemKind: ItemKindName;
      readonly phase: PhaseName;
    }
  | { readonly kind: 'step-without-timeout'; readonly phase: PhaseName }
  | { readonly kind: 'quiet-below-idle' }
  | { readonly kind: 'unattended-below-quiet' }
  | {
      readonly kind: 'engine-outcome-listed';
      readonly phase: PhaseName;
      readonly outcome: EngineOutcome;
    }
  | { readonly kind: 'skills-without-pin'; readonly recipe: string }
  | {
      readonly kind: 'resume-on-forward-edge';
      readonly phase: PhaseName;
      readonly outcome: string;
    }

  // a `hold` edge names one of the engine's hold reasons
  | {
      readonly kind: 'engine-hold-reason';
      readonly phase: PhaseName;
      readonly outcome: string;
      readonly reason: string;
    }

  // a step's phase kind names a worker that the server did not build
  | { readonly kind: 'unknown-worker'; readonly phase: PhaseName; readonly worker: WorkerKindName }

  // a pipeline has a `merge` step, and the file has no `merge` block
  | { readonly kind: 'merge-without-rules' }
  | { readonly kind: 'empty-merge-checks' }

  // a `session: builder` recipe is mapped to a step with no build step before it, so no session
  // is kept for it to wake
  | { readonly kind: 'builder-session-not-kept'; readonly recipe: string };

export type LoadResult =
  | { readonly kind: 'loaded'; readonly rules: LoadedRules; readonly warnings: readonly string[] }
  | { readonly kind: 'rejected'; readonly rejections: readonly LoadRejection[] };
