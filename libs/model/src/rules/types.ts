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
  ItemRow,
  ItemShipped,
  ItemView,
  LeverKind,
  Minutes,
  PhaseName,
  PipelineName,
  PullRequestRow,
  RecipeMaterial,
  RecipeName,
  RelationTypeName,
  RepoName,
  RulesVersion,
  SessionMode,
  ShipRule,
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

export interface ConditionalOutcome<Outcome extends string = string> {
  readonly outcome: Outcome;
  readonly requiredWhen: (rules: Rules) => boolean;
}

// What a conditional outcome's condition reads of the rules file.
export interface Rules {
  readonly merge?: MergeRules | null | undefined;
}

// The code of one phase. Its `outcomes` are the one list of the phase's outcome names: the
// loader checks the rules against it, and `settle` answers with one of them.
export interface PhaseKind<
  Body = unknown,
  Input extends JsonValue = JsonValue,
  Outcomes extends readonly string[] = readonly string[],
  Conditional extends string = string,
> {
  readonly name: PhaseName;
  readonly version: number;
  readonly worker: WorkerKindName;
  readonly outcomes: Outcomes;

  // Outcomes that a step maps only under a condition on the rules: the loader requires one on
  // each step of the phase when `requiredWhen` is true, and refuses it when it is false.
  readonly conditionalOutcomes?: readonly ConditionalOutcome<Conditional>[];
  readonly needsAcceptance: boolean;

  // the session mode of an attempt of this phase; agent when the kind sets none
  readonly mode?: (item: ItemView) => SessionMode;
  readonly input: (ctx: PhaseInputContext) => Input;
  readonly closeOut: CloseOutParser<Body>;

  // Called only with the attempt's valid close-out. A method's parameter is bivariant, so a
  // phase kind of any body still fits `PhaseKind`; a plain function property would refuse it.
  readonly settle: BivariantSettle<Body, Outcomes[number] | NoInfer<Conditional>>['settle'];

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

  // the ship watch's rows for the item, oldest first
  readonly shipped: readonly ItemShipped[];

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

  // The gates the claim checks before it starts the step, in the order `criteria`, then
  // `skipWhen`. The first that says skip settles the step as skipped, with the `skip` edge.
  readonly criteria?: CriteriaGate;
  readonly skipWhen?: readonly SkipCondition[];

  // The wait kinds the claim passes over the step for, until each holds; the third gate, after
  // `criteria` and `skipWhen`.
  readonly waits?: readonly string[];

  // Hours an item may wait at the step before the owner gets one notice; the dispatch module's
  // default applies when it is absent. Set only on a step with `waits`.
  readonly waitNoticeHours?: number;

  // set whenever a gate is: the loader refuses a gate with no skip edge
  readonly skip?: SkipEdge;
}

// The wait kind's answer: `holds` and `skip` leave the item ready, and `skip` also skips the step.
export type WaitAnswer = 'holds' | 'waiting' | 'skip';

// A condition a step waits on. The server registers each wait kind, as it registers the phase kinds.
export interface WaitKind {
  readonly name: string;

  // the loader refuses the wait unless the phase kind of an earlier step has this outcome
  readonly after: { readonly outcome: string };

  // the worker that this server must have built, or the loader refuses the wait
  readonly worker?: WorkerKindName;

  // pure
  readonly read: (subject: WaitSubject, repo: RepoPolicy) => WaitAnswer;
}

export interface WaitSubject {
  readonly item: ItemRow;

  // of the latest merged pull request, by `mergedAt`, among those linked to the item's succeeded builds
  readonly mergeCommit: CommitSha | null;
  readonly shipped: readonly ItemShipped[];
}

// what the rules file says about a repo
export interface RepoPolicy {
  // `none` when the repo has no `repos` entry
  readonly ships: ShipRule;

  // by phase, and by `<phase>/attended`; each replaces the kind's recipe for the phase in this repo
  readonly recipes: Readonly<Record<string, RecipeName>>;
}

// The step runs on the item's lines with this tag; with none, the step skips.
export interface CriteriaGate {
  readonly tagged: string;
}

// the latest run of the named check at the pull request's head passed
export interface SkipCondition {
  readonly checkPassed: string;
}

export type Edge =
  | 'next'
  | 'again'
  | {
      readonly to: PhaseName;
      readonly max?: number;
      readonly resume?: boolean;
      readonly notify?: boolean;
    }
  | { readonly end: string; readonly notify?: boolean }
  | { readonly hold: RulesHoldReason; readonly notify?: boolean };

// never `again`, which would run the skipped step, and never `{ to }`, which skips nothing
export type SkipEdge = 'next' | { readonly end: string } | { readonly hold: RulesHoldReason };

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

  // an agent-mode session with no activity this long fails as `stalled`
  readonly afterSilentMinutes: Minutes;
}

export type ConceptEntry = `${string}@${number}`;

export type PluginRef = string | Readonly<Record<string, JsonValue>>;

export type SignalRef = SignalName | Readonly<Record<string, JsonValue>>;

// What an item's position and state read of the rules loaded now; a `LoadedRules` is one.
export interface ItemRules {
  readonly kinds: ReadonlyMap<ItemKindName, { readonly pipeline: Pipeline }>;
  readonly phases: ReadonlyMap<PhaseName, { readonly needsAcceptance: boolean }>;

  // the wait kinds the server registers, by name
  readonly waits: ReadonlyMap<string, WaitKind>;

  // the repos that have a `repos` entry; any other repo reads as `ships: none`
  readonly repos: ReadonlyMap<RepoName, RepoPolicy>;
}

export interface LoadedRules {
  readonly version: RulesVersion;
  readonly commit: string;
  readonly registry: Registry;
  readonly signals: ReadonlyMap<SignalKey, Resolved<'signal'>>;
  readonly gates: readonly Resolved<'gate'>[];
  readonly kinds: ReadonlyMap<ItemKindName, KindRules>;
  readonly phases: ReadonlyMap<PhaseName, PhaseKind>;
  readonly waits: ReadonlyMap<string, WaitKind>;
  readonly repos: ReadonlyMap<RepoName, RepoPolicy>;
  readonly limits: readonly Limit[];

  // in declared order, each pool's `order` starting with `lead`
  readonly pools: readonly Pool[];
  readonly propagation: readonly PropagationLine[];
  readonly recipes: ReadonlyMap<RecipeName, RecipeMaterial>;
  readonly sleep: SleepRules;

  // the tags an acceptance line may carry
  readonly criterionTags: readonly string[];

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

  // the changes that wait for the owner's sign-off; empty when the rules file sets none
  readonly signoff: readonly SignoffRule[];
}

export interface SignoffRule {
  // shown to the owner as the reason the item waits
  readonly name: string;

  // globs over the paths the pull request changes, from the repo root; never empty
  readonly paths: readonly string[];

  // null matches every repo
  readonly repos: readonly RepoName[] | null;
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
  | { readonly kind: 'missing-repo-recipe'; readonly repo: string; readonly phase: string }
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

  // a step sets `criteria` or `skipWhen` with no `skip` edge
  | { readonly kind: 'gate-without-skip'; readonly phase: PhaseName }

  // a step sets `waitNoticeHours` with no `waits`
  | { readonly kind: 'notice-without-wait'; readonly phase: PhaseName }

  // a step's `waits` names a wait kind that this server does not register
  | { readonly kind: 'unknown-wait-kind'; readonly phase: PhaseName; readonly wait: string }

  // a step waits on a kind that no earlier step's phase kind can precede, because none has the
  // outcome the wait comes after
  | {
      readonly kind: 'wait-without-outcome';
      readonly phase: PhaseName;
      readonly wait: string;
      readonly outcome: string;
    }

  // a step waits on a kind whose worker this server did not build, such as a wait that reads
  // GitHub on a server with no `github` section
  | {
      readonly kind: 'wait-without-worker';
      readonly phase: PhaseName;
      readonly wait: string;
      readonly worker: WorkerKindName;
    }

  // a `skipWhen` entry names no condition that this server reads
  | {
      readonly kind: 'unknown-skip-condition';
      readonly phase: PhaseName;
      readonly condition: string;
    }

  // `criteria.tagged` names a tag that `criterionTags` does not list
  | { readonly kind: 'unknown-criterion-tag'; readonly phase: PhaseName; readonly tag: string }
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

  // two `merge.signoff` rules share a name
  | { readonly kind: 'duplicate-signoff-rule'; readonly name: string }

  // a sign-off outcome is mapped to an edge of the wrong shape: `needs-signoff` must be a
  // `{ hold }` edge and `changes-requested` a `{ to }` edge
  | {
      readonly kind: 'signoff-edge-kind';
      readonly phase: PhaseName;
      readonly outcome: string;
      readonly expected: 'hold' | 'to';
    }

  // a `session: builder` recipe is mapped to a step with no build step before it, so no session
  // is kept for it to wake
  | { readonly kind: 'builder-session-not-kept'; readonly recipe: string }

  // The recipe of a step names an agent that `spawn.agents` lists, and the step's phase, or a repo
  // in `spawn.repos`, is outside the agent's scope. `repo` is null when the phase is the cause.
  | {
      readonly kind: 'agent-outside-scope';
      readonly itemKind: string;
      readonly phase: string;
      readonly recipe: string;
      readonly agent: string;
      readonly repo: string | null;
    }

  // a phase has `requireScopedAgent`, and a kind's recipe for it names an agent that `spawn.agents`
  // doesn't list for that phase
  | {
      readonly kind: 'phase-without-scoped-agent';
      readonly itemKind: string;
      readonly phase: string;
      readonly recipe: string;
      readonly agent: string;
    }

  // a `session: builder` recipe runs a scoped agent, or wakes the session of a build that runs a
  // scoped agent; `agent` is that scoped agent
  | {
      readonly kind: 'scoped-agent-builder-session';
      readonly itemKind: string;
      readonly recipe: string;
      readonly agent: string;
    }

  // an edge with `resume: true` goes to a phase that a scoped agent runs, or the build of its
  // pipeline runs a scoped agent, so the resumed session holds a credential outside its phase
  | {
      readonly kind: 'scoped-agent-session-resumed';
      readonly phase: PhaseName;
      readonly outcome: string;
      readonly to: string;
    };

// The server config's spawn scope, as the rules loader reads it: where each credentialed agent may
// run, the phases that need one, and the repos the server serves
export interface SpawnScope {
  readonly agents: Readonly<
    Record<string, { readonly phases: readonly string[]; readonly repos?: readonly string[] }>
  >;
  readonly phases: Readonly<Record<string, { readonly requireScopedAgent?: boolean }>>;
  readonly repos: readonly string[];
}

export type LoadResult =
  | { readonly kind: 'loaded'; readonly rules: LoadedRules; readonly warnings: readonly string[] }
  | { readonly kind: 'rejected'; readonly rejections: readonly LoadRejection[] };
