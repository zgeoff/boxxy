import type { JsonValue } from '@boxxy/content-hash';
import type { AnyNewFact, OutboxFact } from '../facts/types.ts';
import type { ItemWithLevers } from '../items/types.ts';
import type { HoldReason } from '../pipeline/types.ts';
import type { Limit, LimitFill, SeatRelease, SeatTake, Snapshot } from '../planning/types.ts';
import type { CostToLand, StageTime } from '../reports/types.ts';
import type { ItemRules } from '../rules/types.ts';
import type {
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  AttemptSessionRow,
  CallerIdentity,
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
  KeptSession,
  LeaseRow,
  LeverRow,
  LimitName,
  LimitSeatRow,
  NoteRow,
  NoticeRow,
  PhaseName,
  PoolName,
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

// The item reads derive each item's position and state at `now`, from its rows and the rules given.
export interface StoreReader extends OutboxReader {
  readSnapshot: (now: Instant, rules: ItemRules) => Promise<Snapshot>;
  readItem: (id: ItemId, now: Instant, rules: ItemRules) => Promise<ItemView | null>;
  readItemDetail: (id: ItemId, now: Instant, rules: ItemRules) => Promise<ItemDetailRows | null>;
  listItems: (filter: ItemFilter, now: Instant, rules: ItemRules) => Promise<ItemWithLevers[]>;
  listOpenIssues: (repo: RepoName, now: Instant, rules: ItemRules) => Promise<ItemView[]>;

  // 0 when the item phase has no lease
  readLastLeaseGen: (item: ItemId, phase: PhaseName) => Promise<number>;
  readAttempt: (id: AttemptId) => Promise<AttemptRow | null>;
  listEvidence: (attempt: AttemptId) => Promise<EvidenceRow[]>;

  // oldest first
  listItemAttempts: (item: ItemId) => Promise<AttemptRow[]>;

  // every attempt that has not settled, oldest first
  listLiveAttempts: () => Promise<AttemptRow[]>;

  // settled by the give-up rule at `since` or later, with the session not yet seen stopped
  listStrayAttempts: (since: Instant) => Promise<AttemptRow[]>;
  listSucceededAttemptsWithoutPullRequest: () => Promise<AttemptRow[]>;

  // the latest attempt that the session carries, live or settled
  findAttemptBySession: (session: AtcSessionId) => Promise<AttemptRow | null>;

  // the latest attempt bound to the agent session
  findAttemptByAgentSession: (session: AgentSessionId) => Promise<AttemptId | null>;

  // The session whose latest attempt holds the caller; an older attempt of a session never
  // counts. `ambiguous`: the latest attempts of two sessions hold it.
  findSessionByCaller: (caller: CallerIdentity) => Promise<AtcSessionId | 'ambiguous' | null>;

  // the rows in state `open`
  listWatchedPullRequests: () => Promise<PullRequestRow[]>;

  // the limits of the last sync, by name, each with its held seats counted
  listLimits: () => Promise<LimitFill[]>;

  // the held seats, by limit and then by attempt
  listLimitSeats: () => Promise<LimitSeatRow[]>;

  // oldest first
  listItemNotes: (item: ItemId) => Promise<NoteRow[]>;

  // the rows not yet sent, whatever their tries, oldest first
  listUnsentNotices: (limit: number) => Promise<NoticeRow[]>;

  // oldest kept first
  listKeptSessions: () => Promise<{ readonly item: ItemId; readonly kept: KeptSession }[]>;

  // The settled attempts whose atc session cleanup forgets now: a succeeded attempt at once, a
  // failed one that ended at `failedEndedBefore` or earlier. Only the latest attempt of a session
  // counts; a kept session and a stray session that has not stopped are left out.
  listSessionsToForget: (failedEndedBefore: Instant) => Promise<AttemptRow[]>;

  // null before the runner's first heartbeat, which reads as not paused
  readRunner: (id: RunnerId) => Promise<RunnerRow | null>;
}

// The outbox part of the store, for the outbox sender. "Unsent" leaves out a parked row.
export interface OutboxReader {
  // oldest first
  readUnsentFacts: (limit: number) => Promise<OutboxFact[]>;
  readOutboxCounts: () => Promise<{
    readonly unsent: number;
    readonly parked: number;
    readonly oldestUnsentAt: Instant | null;
  }>;

  // the rows of the item not yet sent, parked rows included
  readItemBehind: (
    item: ItemId,
  ) => Promise<{ readonly facts: number; readonly oldestAt: Instant | null }>;
}

export interface ItemDetailRows {
  readonly item: ItemWithLevers;
  readonly attempts: readonly AttemptRow[];
  readonly relations: readonly RelationRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly pullRequests: readonly PullRequestRow[];
  readonly notes: readonly NoteRow[];
}

// The bookkeeping writes run outside `StoreChange`: they write no fact and move no store version.
export interface StoreTx extends StoreReader {
  applyChange: (change: StoreChange) => Promise<ApplyResult>;

  // a row already sent, or parked, stays as it is
  markFactsSent: (ids: readonly FactId[], at: Instant) => Promise<void>;

  // a row already sent stays as it is
  parkFacts: (ids: readonly FactId[], reason: string, at: Instant) => Promise<void>;

  // clears every park mark of a row not sent, and returns how many it cleared
  unparkFacts: () => Promise<number>;
  writeHeartbeat: (runner: RunnerId, at: Instant) => Promise<void>;

  // Makes the stored limits the loaded ones, and the held seats follow: a seat of a limit that
  // went, or that no longer counts its attempt's stored fields, is released; a live attempt that is
  // not asleep gets one in each limit that newly counts it, past `max` when the limit is full.
  syncLimits: (limits: readonly Limit[], at: Instant) => Promise<void>;
  markPullRequestChecked: (ref: PullRequestRef, at: Instant) => Promise<void>;

  // one more try of the notice; `sent` also sets its `sentAt`
  markNoticeTried: (id: number, at: Instant, sent: boolean) => Promise<void>;
}

// A change may write no fact, such as the suspend mark; such a change moves no store version. The
// attempt builder's change is one of these.
export interface StoreChange {
  readonly at: Instant;

  // the live lease the change was built under; none or null applies under no lease. `holdGen`:
  // the hold generation of the lease's attempt, checked too when it is given.
  readonly under?: {
    readonly item: ItemId;
    readonly phase: PhaseName;
    readonly gen: number;
    readonly holdGen?: number;
  } | null;
  readonly writes: readonly RowWrite[];
  readonly facts: readonly AnyNewFact[];
}

export type ApplyResult =
  | { readonly kind: 'applied' }
  | { readonly kind: 'stale-generation' }
  | { readonly kind: 'lease-held' }
  | { readonly kind: 'limit-full'; readonly limit: LimitName }

  // the take names a limit that the last sync did not store
  | { readonly kind: 'unknown-limit'; readonly limit: LimitName }
  | { readonly kind: 'guard-mismatch'; readonly table: TableName; readonly key: JsonValue };

export interface ItemFilter {
  readonly state?: ItemState;
  readonly repo?: RepoName;
}

// The tables a plain row write may name. The seats are written only through `take-seats` and
// `release-seats`, so no write skips the all-or-none take.
export interface Tables {
  items: ItemRow;
  relations: RelationRow;
  levers: LeverRow;
  attempts: AttemptRow;
  attempt_sessions: AttemptSessionRow;
  leases: LeaseRow;
  decisions: DecisionRow;
  evidence: EvidenceRow;
  pull_requests: PullRequestRow;
  runners: RunnerRow;
  notes: NoteRow;
  notices: NoticeRow;
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

  // a seat in every named limit, or the change is refused
  | { readonly op: 'take-seats'; readonly take: SeatTake }

  // the attempt's held seats of that hold generation; none held is no refusal
  | { readonly op: 'release-seats'; readonly release: SeatRelease };

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

      // set when the session stopped at the account's usage limit: when the limit resets
      readonly usageLimitResetsAt: Instant | null;
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

// What one batch sent to the sink got back. `retry` may or may not have stored the batch.
export type SinkAnswer =
  | { readonly kind: 'stored' }
  | { readonly kind: 'retry'; readonly reason: string }
  | {
      readonly kind: 'refused-batch';
      readonly status: 400 | 413 | 422;
      readonly reason: string;
    }
  | { readonly kind: 'refused-sink'; readonly status: number; readonly reason: string };

export interface FactSink {
  // Sends the rows as one batch, in the order given. It never splits and never reorders.
  send: (facts: readonly OutboxFact[]) => Promise<SinkAnswer>;
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
