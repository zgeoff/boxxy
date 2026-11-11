import type { JsonValue } from '@boxxy/content-hash';
import type { FactType, NewFact, OutboxFact } from '../facts/types.ts';
import type { Snapshot } from '../planning/types.ts';
import type {
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  AttemptSessionRow,
  CommitSha,
  DecisionRow,
  Effort,
  EvidenceRow,
  FactId,
  Instant,
  ItemId,
  ItemRow,
  ItemState,
  ItemView,
  ItemWithLevers,
  LeaseRow,
  LeverRow,
  MaxAttemptsByKind,
  PhaseName,
  PoolName,
  PoolSlotRow,
  PullRequestRef,
  PullRequestRow,
  RelationRow,
  RepoName,
  RunnerId,
  RunnerRow,
} from '../types.ts';

export interface ClaimStore {
  exclusive: <T>(work: (tx: StoreTx) => Promise<T>) => Promise<T>;
  read: <T>(work: (tx: StoreReader) => Promise<T>) => Promise<T>;
}

export interface StoreReader {
  readSnapshot: (now: Instant, maxAttemptsByKind: MaxAttemptsByKind) => Promise<Snapshot>;
  readItem: (
    id: ItemId,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<ItemView | null>;
  readItemDetail: (
    id: ItemId,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<ItemDetailRows | null>;
  listItems: (
    filter: ItemFilter,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<ItemWithLevers[]>;
  listOpenIssues: (
    repo: RepoName,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<ItemView[]>;

  // 0 when the item phase has no lease
  readLastLeaseGen: (item: ItemId, phase: PhaseName) => Promise<number>;
  readAttempt: (id: AttemptId) => Promise<AttemptRow | null>;
  listEvidence: (attempt: AttemptId) => Promise<EvidenceRow[]>;
  listLiveAttempts: () => Promise<AttemptRow[]>;
  listSucceededAttemptsWithoutPullRequest: () => Promise<AttemptRow[]>;
  findAttemptBySession: (session: AtcSessionId) => Promise<AttemptRow | null>;
  findAttemptByAgentSession: (session: AgentSessionId) => Promise<AttemptId | null>;

  // the rows in state `open`
  listWatchedPullRequests: () => Promise<PullRequestRow[]>;

  // retired rows included
  listPoolSlots: () => Promise<PoolSlotRow[]>;

  // oldest first
  readUnsentFacts: (limit: number) => Promise<OutboxFact[]>;
  readOutboxLag: () => Promise<{
    readonly unsent: number;
    readonly oldestUnsentAt: Instant | null;
  }>;

  // null before the runner's first heartbeat, which reads as not paused
  readRunner: (id: RunnerId) => Promise<RunnerRow | null>;
}

export interface ItemDetailRows {
  readonly item: ItemWithLevers;
  readonly attempts: readonly AttemptRow[];
  readonly relations: readonly RelationRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly pullRequests: readonly PullRequestRow[];
}

export interface StoreTx extends StoreReader {
  applyChange: (change: StoreChange) => Promise<ApplyResult>;
  markFactsSent: (ids: FactId[], at: Instant) => Promise<void>;
  writeHeartbeat: (runner: RunnerId, at: Instant) => Promise<void>;
  syncPoolSlots: (
    pools: readonly { readonly name: PoolName; readonly slots: number }[],
  ) => Promise<void>;
  markPullRequestChecked: (ref: PullRequestRef, at: Instant) => Promise<void>;
}

export interface StoreChange {
  at: Instant;
  under?: {
    item: ItemId;
    phase: PhaseName;
    gen: number;
    slot?: { pool: PoolName; slot: number; gen: number };
  };
  writes: RowWrite[];
  facts: AnyNewFact[];
}

export type ApplyResult =
  | { kind: 'applied'; slot: { pool: PoolName; slot: number; gen: number } | null }
  | { kind: 'stale-generation' }
  | { kind: 'lease-held' }
  | { kind: 'no-free-slot' }
  | { kind: 'guard-mismatch'; table: TableName; key: JsonValue };

export interface ItemFilter {
  readonly state?: ItemState;
  readonly repo?: RepoName;
}

export interface Tables {
  items: ItemRow;
  relations: RelationRow;
  levers: LeverRow;
  attempts: AttemptRow;
  attempt_sessions: AttemptSessionRow;
  leases: LeaseRow;
  pool_slots: PoolSlotRow;
  decisions: DecisionRow;
  evidence: EvidenceRow;
  pull_requests: PullRequestRow;
  runners: RunnerRow;
}

export type TableName = keyof Tables;

export type RowWrite =
  | {
      [T in TableName]: { readonly op: 'insert'; readonly table: T; readonly row: Tables[T] };
    }[TableName]
  | {
      [T in TableName]: {
        readonly op: 'update';
        readonly table: T;
        readonly key: Partial<Tables[T]>;
        readonly expect: Partial<Tables[T]>;
        readonly set: Partial<Tables[T]>;
      };
    }[TableName]
  | { readonly op: 'take-slot'; readonly pool: PoolName; readonly holder: AttemptId }
  | {
      readonly op: 'release-slot';
      readonly pool: PoolName;
      readonly slot: number;
      readonly holder: AttemptId;
    };

export type AnyNewFact = { [T in FactType]: NewFact<T> }[FactType];

export interface WorkerKind {
  start: (request: SpawnRequest) => Promise<StartOutcome>;
  reconcile: (attempt: AttemptRow) => Promise<SessionReading>;
}

export type StartOutcome =
  | { kind: 'started'; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: 'refused'; reason: string }
  | { kind: 'unknown'; reason: string };

export type SessionReading =
  | { kind: 'running'; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: 'ended'; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: 'absent' };

export interface SpawnRequest {
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

export interface SessionFault {
  readonly kind: 'fault';
  readonly fault: 'agent-session-owned';
  readonly agentSession: AgentSessionId;
  readonly attempt: AttemptId;
  readonly holder: AttemptId;
}

export interface FactSink {
  append: (
    facts: OutboxFact[],
  ) => Promise<
    'accepted' | { kind: 'unknown'; reason: string } | { kind: 'rejected'; error: string }
  >;
}

export interface CostToLandRow {
  readonly item: ItemId;
  readonly title: string;
  readonly repo: RepoName;
  readonly landedAt: Instant;
  readonly model: string;
  readonly attempts: number;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;

  // input, cache read and cache creation tokens together
  readonly totalInputTokens: number;

  // modelled at list price, not billed
  readonly costUsd: number;
}

export interface CostToLandInput {
  readonly repo?: string;

  // ISO 8601, as the pepys query takes it
  readonly landedFrom?: string;
  readonly landedTo?: string;
}

export interface CostReader {
  costToLand: (input: CostToLandInput) => Promise<CostToLandRow[]>;
}

export interface Forge {
  readPullRequest: (ref: PullRequestRef) => Promise<PullRequestReading | 'not-found'>;
  listOpenPullRequests: (repo: RepoName) => Promise<PullRequestRef[]>;
}

export interface PullRequestReading {
  url: string;
  state: 'open' | 'closed' | 'merged';
  mergedAt: Instant | null;
  mergeCommit: CommitSha | null;
  commits: { sha: CommitSha; message: string }[];
}

export interface Clock {
  now: () => Instant;
}

export type NewId = () => string;
