import type { ContentHash, JsonValue } from '@boxxy/content-hash';
import type { z } from 'zod';
import type { CloseOut } from './closeouts/types.ts';
import type { HoldReason, Position } from './pipeline/types.ts';
import type { brandSchemas } from './rows/brand-schemas.ts';

type BrandOf<K extends keyof typeof brandSchemas> = z.output<(typeof brandSchemas)[K]>;

export type Instant = BrandOf<'instant'>;

export type Minutes = number;

export type ItemId = BrandOf<'itemId'>;

export type AttemptId = BrandOf<'attemptId'>;

export type DecisionId = BrandOf<'decisionId'>;

// A bare UUID version 7. The outbox row's fact ID, an evidence ID that a close-out cites, and
// each ID in `settled.criteria[].evidence` all have this one brand.
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

export type RelationTypeName = BrandOf<'relationTypeName'>;

export type PhaseName = BrandOf<'phaseName'>;

export type PipelineName = BrandOf<'pipelineName'>;

export type PoolName = BrandOf<'poolName'>;

export type LimitName = BrandOf<'limitName'>;

export type RecipeName = BrandOf<'recipeName'>;

export type WorkerKindName = BrandOf<'workerKindName'>;

export type SourceName = BrandOf<'sourceName'>;

export type StreamName = BrandOf<'streamName'>;

export type LeverKind = `${string}.${string}`;

export type RecipeHash = BrandOf<'recipeHash'>;

export type SnapshotHash = BrandOf<'snapshotHash'>;

export type RulesVersion = BrandOf<'rulesVersion'>;

// A name from a phase kind's `outcomes` list.
export type OutcomeName = BrandOf<'outcomeName'>;

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

// A proven caller: who runs an attempt's session, or who sent a request. The core compares two
// of these for equality, on both fields, and reads nothing else from them.
export interface CallerIdentity {
  readonly issuer: string;
  readonly subject: string;
}

export type EvidenceKind = 'pull_request' | 'commit' | 'test' | 'ci-run' | 'live-check';

export interface Criterion {
  readonly id: CriterionId;
  readonly text: string;
  readonly evidence: readonly FactId[];
}

export type DesignMode = 'agent' | 'attended';

// How dispatch reads an attempt's session. Only design gives 'attended' in v1.
export type SessionMode = 'agent' | 'attended';

// v1 writes `claude_code` only. The second value keeps the telemetry tables' other product.
export type Product = 'claude_code' | 'codex';

// The fields of an item that a filter reads. The one v1 field is the design mode, and an item
// that sets none runs in agent mode.
export interface ItemFields {
  readonly designMode?: DesignMode;
}

export interface ItemRow {
  readonly id: ItemId;
  readonly kind: ItemKindName;
  readonly repo: RepoName;
  readonly title: string;
  readonly outcome: string;

  // markdown: context, scope, permissions and notes for the agent, as the owner wrote it
  readonly body: string;
  readonly acceptance: readonly Criterion[];
  readonly fields: ItemFields;

  // free short strings: `item.file` sets them, and `item.edit` replaces the whole list
  readonly labels: readonly string[];
  readonly foundInAttempt: AttemptId | null;
  readonly filedBy: ActorRef;
  readonly filedAt: Instant;
  readonly closedAt: Instant | null;
  readonly closeReason: string | null;

  // state of the item between two attempts, which no fact carries
  readonly keptSession: KeptSession | null;
}

export interface KeptSession {
  readonly atcSession: AtcSessionId;

  // the worker target the session runs on, as `SpawnRequest.target` has it
  readonly target: string;
  readonly attempt: AttemptId;
  readonly keptAt: Instant;
  readonly caller: CallerIdentity | null;
}

// Append-only: no procedure edits or removes a note.
export interface NoteRow {
  readonly item: ItemId;

  // 1, 2, 3… per item
  readonly seq: number;
  readonly text: string;
  readonly by: ActorRef;
  readonly at: Instant;
}

export type ItemState = 'idea' | 'ready' | 'running' | 'blocked' | 'waiting' | 'done' | 'archived';

export type WaitingReason =
  | 'pull request open'
  | 'no pull request linked'
  | 'pull request closed unmerged'
  | HoldReason;

export type DerivedState =
  | { readonly state: Exclude<ItemState, 'waiting'> }
  | { readonly state: 'waiting'; readonly reason: WaitingReason };

// A row of `item.list`: the view without the body, which can be long.
export type ItemListView = Omit<ItemView, 'body'>;

export interface ItemView extends ItemRow {
  readonly derived: DerivedState;
  readonly position: Position;
}

export interface RelationRow {
  readonly source: ItemId;
  readonly target: ItemId;
  readonly type: RelationTypeName;
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

  // only `item.retry --phase` sets it
  readonly phase: PhaseName | null;
  readonly actor: ActorRef;
  readonly at: Instant;
}

export type AttemptState =
  | 'starting'
  | 'running'
  | 'reconciling'
  | 'sleeping'
  | 'waking'
  | 'closing'
  | 'succeeded'
  | 'failed';

export type LiveAttemptState = Exclude<AttemptState, 'succeeded' | 'failed'>;

export type ClosingCause =
  | 'closed-out'
  | 'timed-out'
  | 'item-closed'
  | 'stalled'
  | 'skill-missing'
  | 'turn-ended'
  | 'usage-limit';

export type ForcedFailure =
  | 'spawn-refused'
  | 'no-capacity'
  | 'spawn-lost'
  | 'session-lost'
  | 'resume-lost'
  | 'timed-out'
  | 'item-closed'
  | 'skill-missing'
  | 'stalled'
  | 'usage-limit';

export type KnownFailure = ForcedFailure | 'closeout-missing' | 'closeout-unsettleable';

// The engine's own outcomes. No phase kind may list either name.
export type EngineOutcome = 'lost' | 'unsettleable';

// each field holds a list of values, never one string
export type FieldValues = Readonly<Record<string, readonly string[]>>;

export interface AttemptRow {
  readonly id: AttemptId;
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly number: number;
  readonly runner: RunnerId;
  readonly recipeHash: RecipeHash;
  readonly rulesVersion: RulesVersion;
  readonly pool: PoolName;
  readonly leaseGen: number;
  readonly spawnRequest: JsonValue;
  readonly spawnRequestHash: ContentHash;
  readonly state: AttemptState;
  readonly failure: string | null;
  readonly atcSession: AtcSessionId | null;

  // null: the worker gave no caller, and every session and hook call for the attempt is refused
  readonly caller: CallerIdentity | null;
  readonly claimedAt: Instant;
  readonly startedAt: Instant | null;
  readonly endedAt: Instant | null;

  // what `decide` saw; a wake and a rules reload match limits against these
  readonly fields: FieldValues;
  readonly mode: SessionMode;
  readonly round: number;
  readonly input: JsonValue;

  // 1 at the claim, one higher on each wake; every held seat carries it
  readonly holdGen: number;

  // the first valid close-out, never replaced
  readonly closeOut: CloseOut | null;
  readonly closeOutHash: ContentHash | null;
  readonly closeOutFact: FactId | null;
  readonly closing: ClosingCause | null;
  readonly closingAt: Instant | null;
  readonly suspendRequestedAt: Instant | null;
  readonly sleptAt: Instant | null;
  readonly wakeRequestedAt: Instant | null;
  readonly wokenAt: Instant | null;
  readonly outcome: OutcomeName | EngineOutcome | null;

  // what the phase code returned, for an attempt settled as `closeout-unsettleable`
  readonly returnedOutcome: string | null;
  readonly strayedAt: Instant | null;
  readonly sessionStoppedAt: Instant | null;
  readonly sessionForgottenAt: Instant | null;
}

export interface AttemptSessionRow {
  readonly attempt: AttemptId;
  readonly agentSession: AgentSessionId;
  readonly atcSession: AtcSessionId;
  readonly product: Product;
  readonly source: 'worker' | 'hook';
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

// A limit's count is its rows with no `releasedAt`.
export interface LimitSeatRow {
  readonly limit: LimitName;
  readonly attempt: AttemptId;
  readonly holdGen: number;

  // taken past the limit's `max`, by a wake over the cap
  readonly overCap: boolean;
  readonly takenAt: Instant;
  readonly releasedAt: Instant | null;
}

export interface ObservationBoundary {
  readonly storeVersion: number;
  readonly pepysOffsets: Readonly<Record<StreamName, number>>;
}

// A limit's count and `max` at the moment of a pick.
export interface LimitCount {
  readonly limit: LimitName;
  readonly held: number;
  readonly max: number;
}

export interface DecisionRow {
  readonly id: DecisionId;
  readonly attempt: AttemptId;
  readonly item: ItemId;
  readonly kind: 'start' | 'wake';
  readonly pool: PoolName;
  readonly rulesVersion: RulesVersion;
  readonly snapshotHash: SnapshotHash;
  readonly storeVersion: number;
  readonly pepysOffsets: ObservationBoundary['pepysOffsets'];
  readonly faults: readonly FaultRecord[];

  // each limit that counts the pick, with its count before the seat was taken
  readonly limits: readonly LimitCount[];
  readonly at: Instant;
}

export interface FaultRecord {
  // the signal, gate, waiver or filter field name, or `propagation:<signal>:<relation>`
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

  // GitHub's own `id` of the pull request, which pepys builds its entity ID from
  readonly githubId: number;
  readonly url: string;
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

// A hold notice for the `Notifier` port. The tick tries it again, with no cap, until atc takes it.
export interface NoticeRow {
  readonly id: number;
  readonly item: ItemId;
  readonly reason: HoldReason;
  readonly at: Instant;
  readonly tries: number;
  readonly sentAt: Instant | null;

  // the row's current key is `boxxy-notice:<id>:<keySeq>`
  readonly keySeq: number;

  // uncertain tries under the current key; 0 after each change of key
  readonly keyTries: number;

  // a tick sends the row once now >= nextTryAt; a new row holds its `at`
  readonly nextTryAt: Instant;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Recipe {
  readonly agent: string;
  readonly model: string;
  readonly effort: Effort;

  // the prompt template's path in the rules checkout
  readonly prompt: string;
  readonly source: SourceName;

  // the skills the phase needs; the recipe hash covers the list and the rules' pin
  readonly skills: readonly string[];

  // Verify recipes only. `builder`: the claim wakes the build's kept session, so the builder
  // grades its own work. `fresh`: a new session grades it.
  readonly session?: 'builder' | 'fresh';
}

export interface RecipeMaterial {
  readonly name: RecipeName;
  readonly recipe: Recipe;
  readonly promptHash: ContentHash;
  readonly rulesVersion: RulesVersion;
}

export interface ResolvedRecipe extends RecipeMaterial {
  readonly hash: RecipeHash;
}
