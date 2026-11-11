import type { ContentHash, JsonValue } from '@boxxy/content-hash';
import type { BuildCloseOut, CloseOutParse, Friction, OpenItem } from '../closeouts/types.ts';
import type { RelationPayload } from '../facts/types.ts';
import type { PropagationLine, SignalKey } from '../planning/types.ts';
import type { ConceptEntry, LoadRejection, Registry, Resolved, SignalRef } from '../rules/types.ts';
import type {
  ActorRef,
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  CommitSha,
  Criterion,
  CriterionId,
  DecisionId,
  Effort,
  EvidenceKind,
  EvidenceRow,
  FactId,
  FaultRecord,
  ForcedFailure,
  Instant,
  ItemId,
  ItemKindName,
  ItemState,
  LeaseRow,
  LeverKind,
  LoadedRecipe,
  ObservationBoundary,
  PhaseName,
  PipelineName,
  PoolName,
  PullRequestRef,
  RecipeHash,
  RecipeName,
  RelationRow,
  RepoName,
  RulesVersion,
  RunnerId,
  SnapshotHash,
} from '../types.ts';

// The slice 1 forms of the shapes that v1 replaces. The store, the memory store, planning and
// the rules loader still read and write these; each later slice moves its package to the v1
// shape and deletes the form it no longer needs.

export interface SliceOneItemRow {
  readonly id: ItemId;
  readonly kind: ItemKindName;
  readonly repo: RepoName;
  readonly title: string;
  readonly outcome: string;
  readonly acceptance: readonly Criterion[];
  readonly foundInAttempt: AttemptId | null;
  readonly filedBy: ActorRef;
  readonly filedAt: Instant;
  readonly closedAt: Instant | null;
  readonly closeReason: string | null;
}

export type SliceOneWaitingReason =
  | 'pull request open'
  | 'no pull request linked'
  | 'attempts used up';

export type SliceOneDerivedState =
  | { readonly state: Exclude<ItemState, 'waiting'> }
  | { readonly state: 'waiting'; readonly reason: SliceOneWaitingReason };

export interface SliceOneItemView extends SliceOneItemRow {
  readonly derived: SliceOneDerivedState;
}

export interface SliceOneItemWithLevers extends SliceOneItemView {
  readonly levers: readonly SliceOneLeverRow[];
}

export interface SliceOneItemRows {
  // live relations whose target is the item
  readonly relations: readonly RelationRow[];
  readonly blockerStates: ReadonlyMap<ItemId, ItemState>;
  readonly levers: readonly SliceOneLeverRow[];
  readonly attempts: readonly SliceOneAttemptRow[];
  readonly liveLease: LeaseRow | null;
  readonly pullRequests: readonly SliceOnePullRequestRow[];

  // the kind's `maxAttempts` for the item's current phase
  readonly maxAttempts: number;
}

// the rows a store reads to derive the state of a set of items, with each blocking source item
export interface SliceOneItemSetRows {
  readonly items: readonly SliceOneItemRow[];

  // live relations only
  readonly relations: readonly RelationRow[];
  readonly levers: readonly SliceOneLeverRow[];
  readonly attempts: readonly SliceOneAttemptRow[];
  readonly liveLeases: readonly LeaseRow[];
  readonly pullRequests: readonly SliceOnePullRequestRow[];
}

export type MaxAttemptsByKind = ReadonlyMap<ItemKindName, ReadonlyMap<PhaseName, number>>;

export interface SliceOneLeverRow {
  readonly seq: number;
  readonly kind: LeverKind;
  readonly item: ItemId;
  readonly until: Instant | null;
  readonly expiresAt: Instant | null;
  readonly reason: string | null;
  readonly actor: ActorRef;
  readonly at: Instant;
}

export type SliceOneAttemptState = 'starting' | 'running' | 'reconciling' | 'succeeded' | 'failed';

export type SliceOneLiveAttemptState = Exclude<SliceOneAttemptState, 'succeeded' | 'failed'>;

export interface SliceOneWorkerKind {
  start: (request: SliceOneSpawnRequest) => Promise<SliceOneStartOutcome>;
  reconcile: (attempt: SliceOneAttemptRow) => Promise<SliceOneSessionReading>;
}

export type SliceOneStartOutcome =
  | { kind: 'started'; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: 'refused'; reason: string }
  | { kind: 'unknown'; reason: string };

export type SliceOneSessionReading =
  | { kind: 'running'; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: 'ended'; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: 'absent' };

export interface SliceOneSpawnRequest {
  // the repo's configured local path
  readonly cwd: string;
  readonly prompt: string;
  readonly agent: string;
  readonly model: string;
  readonly effort: Effort;
  readonly pluginDirs: readonly string[];
  readonly name: `boxxy/${string}`;
  readonly idempotencyKey: AttemptId;
}

export interface SliceOneSettlement {
  readonly state: 'succeeded' | 'failed';
  readonly failure: string | null;
  readonly openItems: readonly OpenItem[];
  readonly criteria: readonly {
    readonly criterion: CriterionId;
    readonly evidence: readonly FactId[];
  }[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export interface SliceOneSettleRule<Out = unknown> {
  settle: (input: SliceOneSettleInput<Out>) => SliceOneSettlement;
}

export interface SliceOneSettleInput<Out> {
  readonly attempt: SliceOneAttemptRow;
  readonly item: SliceOneItemView;
  readonly closeOut: CloseOutParse<Out> | null;

  // a `forced` reason wins over the close-out's state
  readonly forced: ForcedFailure | null;
  readonly now: Instant;
}

export interface SliceOneCloseOutContext {
  readonly item: SliceOneItemView;
  readonly attempt: AttemptId;

  // the attempt's own evidence rows
  readonly evidence: readonly EvidenceRow[];
}

export interface SliceOneCloseOutParser<Out> {
  parse: (raw: unknown, ctx: SliceOneCloseOutContext) => CloseOutParse<Out>;
}

export interface SliceOneForge {
  readPullRequest: (ref: PullRequestRef) => Promise<SliceOnePullRequestReading | 'not-found'>;
  listOpenPullRequests: (repo: RepoName) => Promise<PullRequestRef[]>;
}

export interface SliceOnePullRequestReading {
  url: string;
  state: 'open' | 'closed' | 'merged';
  mergedAt: Instant | null;
  mergeCommit: CommitSha | null;
  commits: { sha: CommitSha; message: string }[];
}

export interface SliceOneAttemptRow {
  readonly id: AttemptId;
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly number: number;
  readonly runner: RunnerId;
  readonly recipeHash: RecipeHash;
  readonly rulesVersion: RulesVersion;
  readonly pool: PoolName;
  readonly slot: number;
  readonly slotGen: number;
  readonly leaseGen: number;
  readonly spawnRequest: JsonValue;
  readonly spawnRequestHash: ContentHash;
  readonly state: SliceOneAttemptState;
  readonly failure: string | null;
  readonly atcSession: AtcSessionId | null;
  readonly closeOut: BuildCloseOut | null;
  readonly claimedAt: Instant;
  readonly startedAt: Instant | null;
  readonly endedAt: Instant | null;
}

export interface SliceOneAttemptSessionRow {
  readonly attempt: AttemptId;
  readonly agentSession: AgentSessionId;
  readonly atcSession: AtcSessionId;
  readonly seenAt: Instant;
}

export interface PoolSlotRow {
  readonly pool: PoolName;
  readonly slot: number;
  readonly holder: AttemptId | null;
  readonly gen: number;
  readonly retired: boolean;
}

export interface SliceOneDecisionRow {
  readonly id: DecisionId;
  readonly attempt: AttemptId;
  readonly item: ItemId;
  readonly pool: PoolName;
  readonly rulesVersion: RulesVersion;
  readonly snapshotHash: SnapshotHash;
  readonly storeVersion: number;
  readonly pepysOffsets: ObservationBoundary['pepysOffsets'];
  readonly faults: readonly FaultRecord[];
  readonly at: Instant;
}

export interface SliceOnePullRequestRow {
  readonly repo: RepoName;
  readonly number: number;
  readonly attempt: AttemptId;
  readonly state: 'open' | 'closed' | 'merged';
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
  readonly checkedAt: Instant;
}

export interface SliceOneSnapshot {
  storeVersion: number;

  // every item not yet done and not archived, with its state derived at the read's `now`
  items: SliceOneItemView[];
  relations: RelationRow[];
  levers: SliceOneLeverRow[];
  freeSlots: Record<PoolName, number>;
}

export interface SliceOneDecision {
  // in pool order, then by each pool's `order`
  picks: SliceOnePick[];
}

export interface SliceOnePick {
  item: ItemId;
  phase: PhaseName;
  pool: PoolName;
}

export interface SliceOnePool {
  readonly name: PoolName;
  readonly slots: number;
  readonly takes: Readonly<Record<string, readonly string[]>>;

  // `lead`, then the pool's own `order`: lower first, no value last, then item id
  readonly order: readonly SignalKey[];
}

export interface SliceOneKindRules {
  readonly pipeline: SliceOnePipeline;
  readonly recipes: Readonly<Record<PhaseName, RecipeName>>;
}

export interface SliceOnePipeline {
  readonly name: PipelineName;
  readonly steps: readonly SliceOnePipelineStep[];
}

export interface SliceOnePipelineStep {
  readonly phase: PhaseName;

  // failed attempts before the item waits on "attempts used up"
  readonly maxAttempts: number;
}

export interface SliceOneLoadedRules {
  readonly version: RulesVersion;
  readonly commit: string;
  readonly registry: Registry;
  readonly signals: ReadonlyMap<SignalKey, Resolved<'signal'>>;
  readonly gates: readonly Resolved<'gate'>[];
  readonly kinds: ReadonlyMap<ItemKindName, SliceOneKindRules>;
  readonly maxAttemptsByKind: MaxAttemptsByKind;

  // in declared order, each pool's `order` starting with `lead`
  readonly pools: readonly SliceOnePool[];
  readonly propagation: readonly PropagationLine[];
  readonly recipes: ReadonlyMap<RecipeName, LoadedRecipe>;
}

export interface SliceOneRulesFile {
  readonly version: 1;
  readonly concepts: readonly ConceptEntry[];
  readonly kinds: Readonly<
    Record<
      string,
      {
        readonly pipeline: readonly string[] | PipelineName;
        readonly maxAttempts: Readonly<Record<string, number>>;
        readonly recipes: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly pools: readonly {
    readonly name: string;
    readonly slots: number;
    readonly takes: Readonly<Record<string, JsonValue>>;
    readonly order: readonly SignalRef[];
  }[];
  readonly lead: readonly SignalRef[];
  readonly propagation: readonly {
    readonly value: string;
    readonly over: string;
    readonly toward: 'source' | 'target';
  }[];
  readonly recipes: Readonly<
    Record<
      string,
      {
        readonly agent: string;
        readonly model: string;
        readonly effort: string;
        readonly prompt: string;
        readonly source: string;
      }
    >
  >;
}

export type SliceOneLoadResult =
  | {
      readonly kind: 'loaded';
      readonly rules: SliceOneLoadedRules;
      readonly warnings: readonly string[];
    }
  | { readonly kind: 'rejected'; readonly rejections: readonly LoadRejection[] };

export type SliceOneEntityRef =
  | `boxxy:item:${string}`
  | `boxxy:relation:${string}:${string}:${string}`
  | `boxxy:attempt:${string}`
  | `boxxy:decision:${string}`
  | `boxxy:runner:${string}`;

export interface SliceOneNewFact<T extends SliceOneFactType> {
  readonly id: FactId;
  readonly type: T;
  readonly entity: SliceOneEntityRef;
  readonly actor: ActorRef;
  readonly payload: SliceOneFacts[T];
}

export type SliceOneAnyNewFact = { [T in SliceOneFactType]: SliceOneNewFact<T> }[SliceOneFactType];

export type SliceOneFactType = keyof SliceOneFacts;

export interface SliceOneFacts {
  'boxxy.item.filed': SliceOneItemRow;
  'boxxy.item.edited': {
    readonly title?: string;
    readonly outcome?: string;
    readonly acceptance?: readonly Criterion[];
  };
  'boxxy.item.closed': { readonly reason: string };
  'boxxy.relation.added': RelationPayload;
  'boxxy.relation.removed': RelationPayload;
  'boxxy.lever.recorded': SliceOneLeverRow;
  'boxxy.attempt.claimed': {
    readonly item: ItemId;
    readonly phase: PhaseName;
    readonly number: number;
    readonly pool: PoolName;
    readonly slot: number;
    readonly gen: number;
    readonly recipeHash: RecipeHash;
    readonly rulesVersion: RulesVersion;
  };
  'boxxy.decision.recorded': SliceOneDecisionRow;
  'boxxy.attempt.started': { readonly atcSession: AtcSessionId };
  'boxxy.attempt.reconciling': { readonly reason: string };
  'boxxy.attempt.reconciled': { readonly atcSession: AtcSessionId };
  'boxxy.attempt.session_bound': {
    readonly atcSession: AtcSessionId;
    readonly agentSession: AgentSessionId;
    readonly seenAt: Instant;
  };
  'boxxy.attempt.closed_out': { readonly closeOut: BuildCloseOut };
  'boxxy.attempt.settled': {
    readonly state: 'succeeded' | 'failed';
    readonly failure: string | null;
    readonly endedAt: Instant;
    readonly criteria: readonly {
      readonly criterion: CriterionId;
      readonly evidence: readonly FactId[];
    }[];
    readonly matched: readonly ItemId[];
    readonly frictionDropped: number;
  };
  'boxxy.evidence.recorded': {
    readonly kind: EvidenceKind;
    readonly ref: string;
    readonly observed: string | null;
  };
  'boxxy.pull_request.linked': {
    readonly repo: RepoName;
    readonly number: number;
    readonly url: string;
  };
  'boxxy.commit.linked': {
    readonly repo: RepoName;
    readonly sha: CommitSha;
    readonly pullRequestNumber: number;
  };
  'boxxy.pull_request.merged': {
    readonly repo: RepoName;
    readonly number: number;
    readonly mergedAt: Instant;
    readonly mergeCommit: CommitSha;
  };
  'boxxy.pull_request.closed': { readonly repo: RepoName; readonly number: number };
  'boxxy.proposal.recorded': Friction;
  'boxxy.runner.paused': { readonly runner: RunnerId };
  'boxxy.runner.resumed': { readonly runner: RunnerId };
}
