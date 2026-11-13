import type { JsonValue } from '@boxxy/content-hash';
import type { AnyNewFact, OutboxFact } from '../facts/types.ts';
import type { ItemRevision, ItemWithLevers } from '../items/types.ts';
import type { CheckReading, MergeUnit, MergeableState } from '../merge/types.ts';
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
  ItemKindName,
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
  NoticeSessionRow,
  PhaseName,
  PoolName,
  PullRequestRef,
  PullRequestRow,
  RelationRow,
  RepoName,
  RunnerId,
  RunnerRow,
  WorkerKindName,
} from '../types.ts';

export type {
  GateCall,
  GateCost,
  GateReading,
  GateRound,
  GateRun,
  ReviewGate,
  RoundCause,
  SeverityCounts,
} from './review-gate.ts';

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
  listLiveRelations: (type: RelationRow['type']) => Promise<RelationRow[]>;

  // the open items of one repo whose kind is one of `kinds`, for the dedupe of filed items
  listOpenItems: (
    repo: RepoName,
    kinds: readonly ItemKindName[],
    now: Instant,
    rules: ItemRules,
  ) => Promise<ItemView[]>;

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

  // the row of the pull request in any state, whichever attempt it links
  readPullRequestRow: (ref: PullRequestRef) => Promise<PullRequestRow | null>;

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

  // the rows not yet sent whose `nextTryAt` has passed, oldest `nextTryAt` first
  listNoticesDue: (now: Instant, limit: number) => Promise<NoticeRow[]>;

  // oldest kept first
  listKeptSessions: () => Promise<{ readonly item: ItemId; readonly kept: KeptSession }[]>;

  // The latest attempt of each unkept session that cleanup forgets now: a succeeded one or failed
  // review at once, another failed one that ended at `failedEndedBefore` or earlier. An unstopped
  // stray, with a session or none, is listed only once it strayed before `strayedBefore`.
  listSessionsToForget: (
    failedEndedBefore: Instant,
    strayedBefore: Instant,
  ) => Promise<AttemptRow[]>;

  // null before the runner's first heartbeat, which reads as not paused
  readRunner: (id: RunnerId) => Promise<RunnerRow | null>;

  // null until the owner registers a notice session
  readNoticeSession: () => Promise<NoticeSessionRow | null>;
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

  // the item's `boxxy.item.edited` facts from the outbox, oldest first
  readonly revisions: readonly ItemRevision[];
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

  // one more try of the notice, with the new key state and next try time; a `sentAt` also marks it sent
  markNoticeTried: (id: number, update: NoticeTryUpdate) => Promise<void>;

  // replaces the one notice session row
  writeNoticeSession: (session: NoticeSessionRow) => Promise<void>;
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

      // set when the session stopped at the account's usage limit: when the limit resets, or the
      // time the limit was seen when the reset time is unknown
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

// A git repository that atc clones for the session. The atc daemon clones it before the session
// exists, so a private repository needs `credentialRef`: the name of the daemon's environment
// variable that holds a clone token. The name is no secret; boxxy never reads the token.
export interface GitSource {
  readonly url: string;
  readonly ref: string;
  readonly credentialRef?: { readonly name: string };
}

// Exactly one of the two: `cwd`, the repo's folder on a target on the atc daemon's own host, or
// `source`, which atc clones into a folder it picks on the target.
export type SpawnRequest = SpawnRequestFields &
  ({ readonly cwd: string } | { readonly source: GitSource });

interface SpawnRequestFields {
  // the worker target, such as a host name of the worker kind
  readonly target: string;
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

  // the row's current key; the adapter sends it unchanged
  readonly key: string;
}

export type NoticeOutcome =
  | { readonly kind: 'sent' }

  // atc ran nothing
  | { readonly kind: 'refused'; readonly reason: string }

  // atc may have sent the message
  | { readonly kind: 'uncertain'; readonly reason: string };

// What one try writes to its row, besides one more `tries`.
export interface NoticeTryUpdate {
  readonly sentAt: Instant | null;
  readonly keySeq: number;
  readonly keyTries: number;
  readonly nextTryAt: Instant;
}

// Proves who sent a request to the server. The server's root middleware calls it for every
// session and hook procedure, and knows no header and no token itself. null: no proof, so the
// call is refused.
export interface CallerProof {
  prove: (request: Request) => Promise<CallerIdentity | null>;
}

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

// A spawn or a wake that the worker refused. A refused spawn settles the attempt as `no-capacity`
// or `spawn-refused`; a refused wake sleeps the attempt again for capacity, and otherwise leaves it
// `waking` for the next reading. The runner logs the worker's reason, which no fact carries.
export interface WorkerRefusal {
  readonly kind: 'fault';
  readonly fault: 'spawn-refused' | 'wake-refused';
  readonly attempt: AttemptId;
  readonly item: ItemId;
  readonly cause: 'capacity' | 'other';
  readonly reason: string;
}

// What a claim or a reading returns for the runner to log.
export type RunnerFault = SessionFault | WorkerRefusal;

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

  // the description of the pull request, empty when it has none
  readPullRequestBody: (ref: PullRequestRef) => Promise<string>;

  // the latest run of each check name at `head`, from check runs and commit statuses, with its source
  readChecks: (repo: RepoName, head: CommitSha) => Promise<ReadonlyMap<string, CheckReading>>;

  // the forge's compare of two heads: each changed file with its added and deleted lines
  readChangedFiles: (repo: RepoName, from: CommitSha, to: CommitSha) => Promise<ChangedFile[]>;

  // the checks that the branch requires, by name; empty for a branch that requires none
  readRequiredChecks: (repo: RepoName, branch: string) => Promise<readonly string[]>;
  readMergeable: (ref: PullRequestRef) => Promise<MergeableState>;

  // merges only while the pull request's head is still `head`, and sends one call
  mergeAtHead: (ref: PullRequestRef, head: CommitSha, method: MergeMethod) => Promise<MergeAnswer>;
}

export interface ChangedFile {
  readonly path: string;
  readonly changedLines: number;
}

export interface PullRequestReading {
  readonly url: string;

  // GitHub's own `id` of the pull request
  readonly githubId: number;
  readonly state: 'open' | 'closed' | 'merged';

  // the branch that the pull request merges into
  readonly base: string;
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
  readonly commits: readonly { readonly sha: CommitSha; readonly message: string }[];
}

export type MergeMethod = 'merge' | 'squash' | 'rebase';

// The forge's answer to a merge at a head. `queued`: a merge queue took the pull request, which a
// direct merge never answers.
export type MergeAnswer =
  | { readonly kind: 'merged'; readonly mergeCommit: CommitSha }
  | { readonly kind: 'queued' }
  | { readonly kind: 'head-moved' }
  | { readonly kind: 'not-mergeable'; readonly reason: string };

// The worker of a phase with no agent session and no host, such as the merge. It has no sleep,
// wake, kept session or forget, and starts nothing: the first read moves the attempt to running.
export interface JobWorker {
  // throws when the outside system gives no answer
  read: (attempt: AttemptRow) => Promise<JobReading>;

  // the one effect that the phase kind's `drive` chose
  act: (attempt: AttemptRow, action: JobAction) => Promise<JobActAnswer>;
}

// `observed`: what the phase kind's `drive` reads, such as a merge observation
export interface JobReading {
  readonly kind: 'running';
  readonly observed: JsonValue;
}

export interface JobAction {
  readonly kind: 'merge';
  readonly unit: MergeUnit;
  readonly method: MergeMethod;

  // the check names the drive read as required, for the fact the runner writes before the call
  readonly required: readonly string[];
}

export type JobActAnswer = MergeAnswer | { readonly kind: 'unknown'; readonly reason: string };

export type WorkerShape =
  | { readonly shape: 'session'; readonly worker: WorkerKind }
  | { readonly shape: 'job'; readonly worker: JobWorker };

// The workers that the server builds, by the name a phase kind's `worker` gives.
export type WorkerRegistry = ReadonlyMap<WorkerKindName, WorkerShape>;

export interface Clock {
  now: () => Instant;
}

export type NewId = () => string;
