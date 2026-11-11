import type { JsonValue } from '@boxxy/content-hash';
import type { OutboxFact } from '../facts/types.ts';
import type { HoldReason } from '../pipeline/types.ts';
import type { CostToLand, StageTime } from '../reports/types.ts';
import type {
  MaxAttemptsByKind,
  PoolSlotRow,
  SliceOneAnyNewFact,
  SliceOneAttemptRow,
  SliceOneAttemptSessionRow,
  SliceOneDecisionRow,
  SliceOneItemRow,
  SliceOneItemView,
  SliceOneItemWithLevers,
  SliceOneLeverRow,
  SliceOnePullRequestRow,
  SliceOneSnapshot,
} from '../slice-one/types.ts';
import type {
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  CallerIdentity,
  CommitSha,
  Effort,
  EvidenceRow,
  FactId,
  Instant,
  ItemId,
  ItemState,
  KeptSession,
  LeaseRow,
  PhaseName,
  PoolName,
  PullRequestRef,
  RelationRow,
  RepoName,
  RunnerId,
  RunnerRow,
} from '../types.ts';

// The store ports still read and write the slice 1 rows. The store slice moves them to v1.
export interface ClaimStore {
  exclusive: <T>(work: (tx: StoreTx) => Promise<T>) => Promise<T>;
  read: <T>(work: (tx: StoreReader) => Promise<T>) => Promise<T>;
}

export interface StoreReader {
  readSnapshot: (now: Instant, maxAttemptsByKind: MaxAttemptsByKind) => Promise<SliceOneSnapshot>;
  readItem: (
    id: ItemId,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<SliceOneItemView | null>;
  readItemDetail: (
    id: ItemId,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<ItemDetailRows | null>;
  listItems: (
    filter: ItemFilter,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<SliceOneItemWithLevers[]>;
  listOpenIssues: (
    repo: RepoName,
    now: Instant,
    maxAttemptsByKind: MaxAttemptsByKind,
  ) => Promise<SliceOneItemView[]>;

  // 0 when the item phase has no lease
  readLastLeaseGen: (item: ItemId, phase: PhaseName) => Promise<number>;
  readAttempt: (id: AttemptId) => Promise<SliceOneAttemptRow | null>;
  listEvidence: (attempt: AttemptId) => Promise<EvidenceRow[]>;
  listLiveAttempts: () => Promise<SliceOneAttemptRow[]>;
  listSucceededAttemptsWithoutPullRequest: () => Promise<SliceOneAttemptRow[]>;
  findAttemptBySession: (session: AtcSessionId) => Promise<SliceOneAttemptRow | null>;
  findAttemptByAgentSession: (session: AgentSessionId) => Promise<AttemptId | null>;

  // the rows in state `open`
  listWatchedPullRequests: () => Promise<SliceOnePullRequestRow[]>;

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
  readonly item: SliceOneItemWithLevers;
  readonly attempts: readonly SliceOneAttemptRow[];
  readonly relations: readonly RelationRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly pullRequests: readonly SliceOnePullRequestRow[];
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
  facts: SliceOneAnyNewFact[];
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
  items: SliceOneItemRow;
  relations: RelationRow;
  levers: SliceOneLeverRow;
  attempts: SliceOneAttemptRow;
  attempt_sessions: SliceOneAttemptSessionRow;
  leases: LeaseRow;
  pool_slots: PoolSlotRow;
  decisions: SliceOneDecisionRow;
  evidence: EvidenceRow;
  pull_requests: SliceOnePullRequestRow;
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

// The worker port: one adapter per kind of worker host, such as atc.
export interface WorkerKind {
  start: (request: SpawnRequest) => Promise<StartOutcome>;
  reconcile: (attempt: AttemptRow) => Promise<SessionReading>;

  // `active` only when the session shows activity after `ifIdleSince`
  suspend: (attempt: AttemptRow, ifIdleSince: Instant | null) => Promise<SuspendOutcome>;
  resume: (attempt: AttemptRow) => Promise<StartOutcome>;

  // stops the session and keeps it listed; safe to send twice
  stop: (attempt: AttemptRow) => Promise<StopOutcome>;

  // removes a stopped session; safe to send twice
  forget: (session: AtcSessionId) => Promise<ForgetOutcome>;

  // wakes a kept session and sends the request's prompt as a message, in place of a spawn
  resumeKept: (kept: KeptSession, request: SpawnRequest) => Promise<StartOutcome>;
}

export type StartOutcome =
  | {
      readonly kind: 'started';
      readonly atcSession: AtcSessionId;
      readonly agentSession: AgentSessionId | null;
      readonly caller: CallerIdentity | null;
    }

  // `capacity`: the target has no free slot for a session
  | { readonly kind: 'refused'; readonly cause: 'capacity' | 'other'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string };

export type SuspendOutcome =
  | { readonly kind: 'suspended' }
  | { readonly kind: 'active' }
  | { readonly kind: 'refused' | 'unknown'; readonly reason: string };

export type StopOutcome =
  | { readonly kind: 'stopped' | 'absent' }
  | { readonly kind: 'refused' | 'unknown'; readonly reason: string };

export type ForgetOutcome =
  | { readonly kind: 'forgotten' | 'absent' }
  | { readonly kind: 'refused' | 'unknown'; readonly reason: string };

// `running` is a live agent process, whether it works, waits for input or ended its turn.
export type SessionReading =
  | {
      readonly kind: 'running';
      readonly atcSession: AtcSessionId;
      readonly agentSession: AgentSessionId | null;
      readonly caller: CallerIdentity | null;
      readonly attention: Attention;

      // the later of `lastOwnerAt` and the host's last trail event
      readonly lastActivityAt: Instant;

      // the last time the owner attached to the session
      readonly lastOwnerAt: Instant;
    }
  | {
      readonly kind: 'suspended';
      readonly atcSession: AtcSessionId;
      readonly agentSession: AgentSessionId | null;
      readonly asked: boolean;
    }
  | {
      readonly kind: 'ended';
      readonly atcSession: AtcSessionId;
      readonly agentSession: AgentSessionId | null;
    }
  | { readonly kind: 'absent' };

export type Attention = 'working' | 'needs-input' | 'turn-ended';

export interface SpawnRequest {
  // the worker target, such as a host name of the worker kind
  readonly target: string;

  // the repo's configured path on the target
  readonly cwd: string;
  readonly prompt: string;
  readonly agent: string;
  readonly model: string;
  readonly effort: Effort;
  readonly name: `boxxy/${string}`;
  readonly idempotencyKey: AttemptId;
}

// `command`: `boxxy item wake`. `session-ran`: a reading shows the session running while the
// attempt sleeps. `host-slept-unasked`: the host slept with no request, so the attempt wakes.
export type WakeSource = 'command' | 'session-ran' | 'host-slept-unasked';

// Called after the store change that puts an item on hold, never inside it.
export interface Notifier {
  tellHold: (notice: HoldNotice) => Promise<NoticeOutcome>;
}

export interface HoldNotice {
  readonly item: ItemId;
  readonly reason: HoldReason;
  readonly at: Instant;
}

export type NoticeOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'failed'; readonly reason: string };

// The pools that the runner gives no pick in, after the worker refused a session for capacity.
export interface CapacityBackoff {
  hold: (pool: PoolName, until: Instant) => void;

  // each pool whose `until` is after `now`
  listHeld: (now: Instant) => readonly PoolName[];
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

// The reports of pepys about one item.
export interface PepysReader {
  readCostToLand: (item: ItemId) => Promise<PepysAnswer<CostToLand>>;

  // the environment is the adapter's own
  readStageTime: (item: ItemId) => Promise<PepysAnswer<StageTime>>;
}

export type PepysAnswer<Value> =
  | { readonly kind: 'value'; readonly value: Value }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface Forge {
  readPullRequest: (ref: PullRequestRef) => Promise<PullRequestReading | 'not-found'>;
  listOpenPullRequests: (repo: RepoName) => Promise<PullRequestRef[]>;
}

export interface PullRequestReading {
  readonly url: string;

  // GitHub's own `id` of the pull request
  readonly githubId: number;
  readonly state: 'open' | 'closed' | 'merged';
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
  readonly commits: readonly { readonly sha: CommitSha; readonly message: string }[];
}

export interface Clock {
  now: () => Instant;
}

export type NewId = () => string;
