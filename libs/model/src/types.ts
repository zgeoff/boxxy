import type { ContentHash, JsonValue } from '@boxxy/content-hash';
import type { z } from 'zod';
import type { BuildCloseOut } from './facts/types.ts';
import type { brandSchemas } from './rows/brand-schemas.ts';

type BrandOf<K extends keyof typeof brandSchemas> = z.output<(typeof brandSchemas)[K]>;

export type Instant = BrandOf<'instant'>;

export type Minutes = number;

export type ItemId = BrandOf<'itemId'>;

export type AttemptId = BrandOf<'attemptId'>;

export type DecisionId = BrandOf<'decisionId'>;

export type FactId = BrandOf<'factId'>;

export type RunnerId = BrandOf<'runnerId'>;

export type AtcSessionId = BrandOf<'atcSessionId'>;

export type AgentSessionId = BrandOf<'agentSessionId'>;

export type CommitSha = BrandOf<'commitSha'>;

export type RepoName = BrandOf<'repoName'>;

export type CriterionId = BrandOf<'criterionId'>;

export interface PullRequestRef {
  readonly repo: RepoName;
  readonly number: number;
}

export type ItemKindName = BrandOf<'itemKindName'>;

export type LinkTypeName = BrandOf<'linkTypeName'>;

export type PhaseName = BrandOf<'phaseName'>;

export type PipelineName = BrandOf<'pipelineName'>;

export type PoolName = BrandOf<'poolName'>;

export type RecipeName = BrandOf<'recipeName'>;

export type WorkerKindName = BrandOf<'workerKindName'>;

export type SourceName = BrandOf<'sourceName'>;

export type StreamName = BrandOf<'streamName'>;

export type LeverKind = `${string}.${string}`;

export type RecipeHash = BrandOf<'recipeHash'>;

export type SnapshotHash = BrandOf<'snapshotHash'>;

export type RulesVersion = BrandOf<'rulesVersion'>;

export interface ConceptPin {
  readonly ref: `${string}@${number}`;
  readonly sourceHash: ContentHash;
}

export type Actor =
  | { readonly kind: 'owner' }
  | { readonly kind: 'attempt'; readonly attempt: AttemptId }
  | { readonly kind: 'runner'; readonly runner: RunnerId }
  | { readonly kind: 'hook'; readonly attempt: AttemptId };

export type ActorRef =
  | 'boxxy:owner:local'
  | `boxxy:runner:${string}`
  | `boxxy:attempt:${string}`
  | `boxxy:hook:${string}`;

export type EvidenceKind = 'pr' | 'commit' | 'test' | 'ci-run' | 'live-check';

export interface Criterion {
  readonly id: CriterionId;
  readonly text: string;
  readonly evidence: readonly FactId[];
}

export interface ItemRow {
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

export type ItemState = 'idea' | 'ready' | 'running' | 'blocked' | 'waiting' | 'done' | 'archived';

export type WaitingReason = 'PR open' | 'no PR linked' | 'attempts used up';

export type DerivedState =
  | { readonly state: Exclude<ItemState, 'waiting'> }
  | { readonly state: 'waiting'; readonly reason: WaitingReason };

export interface ItemView extends ItemRow {
  readonly derived: DerivedState;
}

export interface ItemRows {
  // live links whose target is the item
  readonly links: readonly LinkRow[];
  readonly blockerStates: ReadonlyMap<ItemId, ItemState>;
  readonly levers: readonly LeverRow[];
  readonly attempts: readonly AttemptRow[];
  readonly liveLease: LeaseRow | null;
  readonly pullRequests: readonly PullRequestRow[];

  // the kind's `maxAttempts` for the item's current phase
  readonly maxAttempts: number;
}

// the rows a store reads to derive the state of a set of items, with each blocking source item
export interface ItemSetRows {
  readonly items: readonly ItemRow[];

  // live links only
  readonly links: readonly LinkRow[];
  readonly levers: readonly LeverRow[];
  readonly attempts: readonly AttemptRow[];
  readonly liveLeases: readonly LeaseRow[];
  readonly pullRequests: readonly PullRequestRow[];
}

export type MaxAttemptsByKind = ReadonlyMap<ItemKindName, ReadonlyMap<PhaseName, number>>;

export interface ItemWithLevers extends ItemView {
  readonly levers: readonly LeverRow[];
}

export interface LinkRow {
  readonly source: ItemId;
  readonly target: ItemId;
  readonly type: LinkTypeName;
  readonly addedBy: ActorRef;
  readonly addedAt: Instant;
  readonly removedAt: Instant | null;
}

export interface LeverRow {
  readonly seq: number;
  readonly kind: LeverKind;
  readonly item: ItemId;
  readonly until: Instant | null;
  readonly expiresAt: Instant | null;
  readonly reason: string | null;
  readonly actor: ActorRef;
  readonly at: Instant;
}

export type AttemptState = 'starting' | 'running' | 'reconciling' | 'succeeded' | 'failed';

export type LiveAttemptState = Extract<AttemptState, 'starting' | 'running' | 'reconciling'>;

export type KnownFailure = 'spawn-refused' | 'session-lost' | 'spawn-lost' | 'closeout-missing';

export type ForcedFailure = Extract<KnownFailure, 'spawn-refused' | 'session-lost' | 'spawn-lost'>;

export interface AttemptRow {
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
  readonly state: AttemptState;
  readonly failure: string | null;
  readonly atcSession: AtcSessionId | null;
  readonly closeOut: BuildCloseOut | null;
  readonly claimedAt: Instant;
  readonly startedAt: Instant | null;
  readonly endedAt: Instant | null;
}

export interface AttemptSessionRow {
  readonly attempt: AttemptId;
  readonly agentSession: AgentSessionId;
  readonly atcSession: AtcSessionId;
  readonly seenAt: Instant;
}

export interface LeaseRow {
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly attempt: AttemptId;
  readonly gen: number;
  readonly takenAt: Instant;
  readonly releasedAt: Instant | null;
}

export interface PoolSlotRow {
  readonly pool: PoolName;
  readonly slot: number;
  readonly holder: AttemptId | null;
  readonly gen: number;
  readonly retired: boolean;
}

export interface ObservationBoundary {
  readonly storeVersion: number;
  readonly pepysOffsets: Readonly<Record<StreamName, number>>;
}

export interface DecisionRow {
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

export interface FaultRecord {
  // the signal, gate, waiver or filter field name, or `propagation:<signal>:<link>`
  readonly plugin: string;
  readonly kind: 'signal' | 'gate' | 'waiver' | 'admission' | 'propagation' | 'filter-field';
  readonly item: ItemId | null;
  readonly error: string;
}

export type EvidenceSource = 'hook' | 'trailer' | 'agent' | 'watch';

export interface EvidenceRow {
  readonly factId: FactId;
  readonly attempt: AttemptId;
  readonly kind: EvidenceKind;
  readonly ref: string;
  readonly observed: string | null;
  readonly source: EvidenceSource;
  readonly at: Instant;
}

export interface PullRequestRow {
  readonly repo: RepoName;
  readonly number: number;
  readonly attempt: AttemptId;
  readonly state: 'open' | 'closed' | 'merged';
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
  readonly checkedAt: Instant;
}

export interface RunnerRow {
  readonly id: RunnerId;
  readonly heartbeatAt: Instant;
  readonly paused: boolean;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Recipe {
  readonly agent: string;
  readonly model: string;
  readonly effort: Effort;

  // the prompt template's path in the rules checkout
  readonly prompt: string;
  readonly source: SourceName;
}

export interface RecipeMaterial {
  readonly name: RecipeName;
  readonly recipe: Recipe;
  readonly promptHash: ContentHash;
  readonly pluginFolderHash: ContentHash;
  readonly rulesVersion: RulesVersion;
}

// the loader can't see the plugin folder, so claimNext adds its hash
export type LoadedRecipe = Omit<RecipeMaterial, 'pluginFolderHash'>;

export interface ResolvedRecipe extends RecipeMaterial {
  readonly hash: RecipeHash;
}
