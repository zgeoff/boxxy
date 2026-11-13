// 02-ports.ts: the driven ports. A module reaches every outside system through one of these, and
// an adapter in adapters/<port>-<system> implements it.
//
// Package: the port types live in @boxxy/model (libs/model), because dispatch and the adapters both
// use them. @boxxy/dispatch holds `bindSession`, each port's memory fake and its contract suite.
// Owning docs: slice-1.md "Ports and adapters", architecture.md "Style", core-model.md "Workers"
// and "Asks and grants".
//
// Slice 1 ports: ClaimStore (StoreReader, StoreTx, StoreChange, ApplyResult), WorkerKind
// (StartOutcome, SessionReading), FactSink, Forge, and the CostReader the CLI calls. Later ports
// follow. Capacity readers are in 08-capacity.ts and the train's forge in 09-merge-train.ts.

import type {
  AgentSessionId,
  AskId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  AttemptSessionRow,
  CommitSha,
  ContentHash,
  Effort,
  EntityRefLater,
  FactEnvelope,
  FactId,
  FactMap,
  GrantId,
  Instant,
  ItemId,
  ItemKindName,
  ItemState,
  ItemView,
  ItemWithLevers,
  JsonValue,
  LeaseRow,
  MaxAttemptsByKind,
  NewFact,
  OutboxFact,
  PhaseName,
  PoolName,
  PoolSlotRow,
  PullRequestRef,
  PullRequestRow,
  RepoName,
  RunnerId,
  RunnerRow,
  SliceOneFacts,
  StreamName,
  WorkerKindName,
  ActorRef,
  ActorRefLater,
  ItemRow,
  LinkRow,
  LeverRow,
  DecisionRow,
  EvidenceRow,
} from "./00-core.ts";
import { factId, workerKindName } from "./00-core.ts";
import type { Condition } from "./01-registries.ts";
import type { Snapshot } from "./04-planning.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// `startClaim` in @boxxy/dispatch starts a claimed attempt after the commit, outside the lock, and
// records the outcome under the claim's lease generation. A `started` outcome that carries an agent
// session id binds it to the attempt in the same change. Reconcile binds a new id the same way. The
// server passes `logFault`, because a module writes no log itself.

export async function exampleStartCallSite(store: ClaimStore, worker: WorkerKind, claim: { attempt: AttemptRow; spawn: SpawnRequest }, now: Instant, newId: NewId, logFault: (fault: SessionFault) => void) {
  const outcome = await worker.start(claim.spawn);
  if (outcome.kind !== "started") return;
  const attempt = claim.attempt;
  await store.exclusive(async (tx) => {
    const bound = outcome.agentSession === null ? null : await bindSession(tx, attempt, { attempt: attempt.id, agentSession: outcome.agentSession, atcSession: outcome.atcSession, seenAt: now }, newId);
    if (bound?.kind === "fault") logFault(bound);
    const binding = bound?.kind === "bind" ? bound : null;
    return tx.applyChange({
      at: now,
      under: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
      writes: [
        { op: "update", table: "attempts", key: { id: attempt.id }, expect: { state: "starting" }, set: { state: "running", atcSession: outcome.atcSession, startedAt: now } },
        ...(binding ? [binding.write] : []),
      ],
      facts: [
        { id: factId(`manual:${newId()}`), type: "boxxy.attempt.started", entity: `boxxy:attempt:${attempt.id}`, actor: `boxxy:runner:${attempt.runner}`, payload: { atcSession: outcome.atcSession } },
        ...(binding ? [binding.fact] : []),
      ],
    });
  });
}

/** An agent session id that already belongs to another attempt. The runner logs it; nothing is written. */
export type SessionFault = { readonly kind: "fault"; readonly fault: "agent-session-owned"; readonly agentSession: AgentSessionId; readonly attempt: AttemptId; readonly holder: AttemptId };

/**
 * The row and fact that bind an agent session to an attempt, in @boxxy/dispatch. It reads inside the
 * same `exclusive` call as the write, so the insert is idempotent: a pair the table holds gives
 * `held` and writes nothing. Slice 1. Owner: slice-1.md "Agent sessions".
 */
export async function bindSession(tx: StoreReader, attempt: AttemptRow, row: AttemptSessionRow, newId: NewId): Promise<{ kind: "bind"; write: RowWrite; fact: AnyNewFact } | { kind: "held" } | SessionFault> {
  const holder = await tx.findAttemptByAgentSession(row.agentSession);
  if (holder === attempt.id) return { kind: "held" };
  if (holder !== null) return { kind: "fault", fault: "agent-session-owned", agentSession: row.agentSession, attempt: attempt.id, holder };
  return {
    kind: "bind",
    write: { op: "insert", table: "attempt_sessions", row },
    fact: {
      id: factId(`manual:${newId()}`),
      type: "boxxy.attempt.session_bound",
      entity: `boxxy:attempt:${attempt.id}`,
      actor: `boxxy:runner:${attempt.runner}`,
      payload: { atcSession: row.atcSession, agentSession: row.agentSession, seenAt: row.seenAt },
    },
  };
}

// ── ClaimStore (slice 1, verbatim) ─────────────────────────────────────────────────────────────

/** The boxxy store: the only writer of claims. Slice 1. Owner: dispatch.md, slice-1.md "One write path". */
export interface ClaimStore {
  // BEGIN IMMEDIATE, run work, COMMIT; ROLLBACK when work throws.
  exclusive<T>(work: (tx: StoreTx) => Promise<T>): Promise<T>;
  // A read in one deferred transaction, for queries and the runner's polls.
  read<T>(work: (tx: StoreReader) => Promise<T>): Promise<T>;
}

// The rules every ClaimStore keeps, which its contract suite checks: slice-1.md "Store rules".

/**
 * Reads inside one store transaction. A reader that derives item state takes `now` and each kind's
 * `maxAttempts`, and applies `liveLevers` and `deriveItemState` from @boxxy/model, so the SQLite
 * store and the fake agree. Slice 1. Owner: slice-1.md "Ports and adapters".
 */
export interface StoreReader {
  readSnapshot(now: Instant, maxAttemptsByKind: MaxAttemptsByKind): Promise<Snapshot>;
  readItem(id: ItemId, now: Instant, maxAttemptsByKind: MaxAttemptsByKind): Promise<ItemView | null>;
  readItemDetail(id: ItemId, now: Instant, maxAttemptsByKind: MaxAttemptsByKind): Promise<ItemDetailRows | null>; // `item.get`
  listItems(filter: ItemFilter, now: Instant, maxAttemptsByKind: MaxAttemptsByKind): Promise<ItemWithLevers[]>; // `item.list`, with live levers
  listOpenItems(repo: RepoName, kinds: readonly ItemKindName[], now: Instant, maxAttemptsByKind: MaxAttemptsByKind): Promise<ItemView[]>; // settle's dedupe: the open items of each kind the entries name
  readLastLeaseGen(item: ItemId, phase: PhaseName): Promise<number>; // 0 when the item phase has no lease
  readAttempt(id: AttemptId): Promise<AttemptRow | null>;
  listEvidence(attempt: AttemptId): Promise<EvidenceRow[]>; // the close-out parser's context
  listLiveAttempts(): Promise<AttemptRow[]>;
  listSucceededAttemptsWithoutPr(): Promise<AttemptRow[]>;
  findAttemptBySession(session: AtcSessionId): Promise<AttemptRow | null>;
  findAttemptByAgentSession(session: AgentSessionId): Promise<AttemptId | null>; // from `attempt_sessions`
  listWatchedPullRequests(): Promise<PullRequestRow[]>; // rows in state `open`
  listPoolSlots(): Promise<PoolSlotRow[]>; // retired rows included, for `runner.status`
  readUnsentFacts(limit: number): Promise<OutboxFact[]>; // oldest first
  readOutboxLag(): Promise<{ readonly unsent: number; readonly oldestUnsentAt: Instant | null }>;
  readRunner(id: RunnerId): Promise<RunnerRow | null>; // null before the first heartbeat: not paused
}

/** The rows `item.get` returns beside the item. */
export type ItemDetailRows = {
  readonly item: ItemWithLevers;
  readonly attempts: readonly AttemptRow[];
  readonly links: readonly LinkRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly pullRequests: readonly PullRequestRow[];
};

/** Writes inside `exclusive`. Slice 1. Owner: slice-1.md "One write path". */
export interface StoreTx extends StoreReader {
  applyChange(change: StoreChange): Promise<ApplyResult>;
  // Bookkeeping writes: outside StoreChange, no fact, no store version change.
  markFactsSent(ids: FactId[], at: Instant): Promise<void>;
  writeHeartbeat(runner: RunnerId, at: Instant): Promise<void>; // inserts the runner row on its first beat
  syncPoolSlots(pools: readonly { readonly name: PoolName; readonly slots: number }[]): Promise<void>; // on each rules load; adds and retires rows, never deletes
  markPullRequestChecked(ref: PullRequestRef, at: Instant): Promise<void>;
}

/**
 * Every write of boxxy state: rows and their outbox facts, all or none. The caller makes every
 * fact id and the time, so the store makes no id and reads no clock. Slice 1.
 */
export type StoreChange = {
  at: Instant; // each outbox row's `at`
  // The leases it writes under: the item phase and its live lease generation, and for a settle the
  // slot lease with the slot `gen` the attempt's take made. A stale generation refuses the change.
  // A change with no `under` holds no lease: the commands, the PR watch and `evidence.recordPr`.
  under?: { item: ItemId; phase: PhaseName; gen: number; slot?: { pool: PoolName; slot: number; gen: number } };
  writes: RowWrite[]; // inserts and guarded updates, typed per table
  facts: AnyNewFact[]; // outbox rows, written in the same transaction as the writes
};
// later: `StoreChangeLater` below takes facts from every later catalog.

export type ApplyResult =
  | { kind: "applied"; slot: { pool: PoolName; slot: number; gen: number } | null } // slot: the slot lease it took
  | { kind: "stale-generation" }
  | { kind: "lease-held" }
  | { kind: "no-free-slot" }
  | { kind: "guard-mismatch"; table: TableName; key: JsonValue }; // an update found no row, or a row its `expect` doesn't match
// A unique index that refuses an insert throws, and the transaction rolls back: no caller in slice 1
// writes one without reading first.

export type ItemFilter = { readonly state?: ItemState; readonly repo?: RepoName };

/** The store's tables and their row types. The adapter maps camelCase to the snake_case columns. */
export type Tables = {
  items: ItemRow;
  links: LinkRow;
  levers: LeverRow;
  attempts: AttemptRow;
  attempt_sessions: AttemptSessionRow;
  leases: LeaseRow;
  pool_slots: PoolSlotRow;
  decisions: DecisionRow;
  evidence: EvidenceRow;
  pull_requests: PullRequestRow;
  runners: RunnerRow; // `runner.pause` and `runner.resume` upsert the row with their fact
};
export type TableName = keyof Tables;

/** One row write. An update names its key, what it expects to find, and what it sets; a mismatch refuses the change. */
export type RowWrite =
  | { [T in TableName]: { readonly op: "insert"; readonly table: T; readonly row: Tables[T] } }[TableName]
  | {
      [T in TableName]: {
        readonly op: "update";
        readonly table: T;
        readonly key: Partial<Tables[T]>;
        readonly expect: Partial<Tables[T]>;
        readonly set: Partial<Tables[T]>;
      };
    }[TableName]
  // The change names only the pool. The caller writes `slot: 0` and `slotGen: 0` in the attempt row
  // and the `boxxy.attempt.claimed` payload. Inside applyChange the adapter takes the lowest free,
  // unretired slot, and overwrites both in the `attempts` insert whose id is `holder` and in the
  // claimed fact whose entity is `boxxy:attempt:<holder>`. A lever insert works the same way: the
  // caller writes `seq: 0`, and the adapter writes the real `seq` into the row and its fact.
  | { readonly op: "take-slot"; readonly pool: PoolName; readonly holder: AttemptId }
  | { readonly op: "release-slot"; readonly pool: PoolName; readonly slot: number; readonly holder: AttemptId };

/** A new slice 1 fact, with its payload tied to its type. */
export type AnyNewFact = { [T in keyof SliceOneFacts & string]: NewFact<T, SliceOneFacts> }[keyof SliceOneFacts & string];

/** The change with facts from every later catalog. Each later slice adds its catalog to `AnyFactsLater`. */
export type StoreChangeLater = Omit<StoreChange, "facts"> & { facts: AnyNewFactLater[] };
export type AnyNewFactLater = { [T in keyof AnyFactsLater & string]: NewFact<T, AnyFactsLater> }[keyof AnyFactsLater & string];
export type AnyFactsLater = SliceOneFacts & import("./05-dispatch.ts").DispatchFacts & import("./07-measurement.ts").MeasurementFacts & import("./08-capacity.ts").CapacityFacts & import("./09-merge-train.ts").TrainFacts;

// ── WorkerKind (slice 1; generics and host needs later) ────────────────────────────────────────

/**
 * Starts an attempt and reconciles it after a crash. Slice 1: atc's request and reading. Owner:
 * core-model.md "Workers", dispatch.md "Unknown outcomes".
 */
export interface WorkerKind {
  start(request: SpawnRequest): Promise<StartOutcome>;
  reconcile(attempt: AttemptRow): Promise<SessionReading>;
}
// later: `WorkerKindLater` below takes its own request and reading types, and adds `name`, `needs`
// and `targets`. After slice 2.

/**
 * A worker kind with its own request and reading types, which names itself and declares what a
 * runner must offer to host it. Later.
 */
export interface WorkerKindLater<Req, Reading extends WorkerReading> {
  start(request: Req): Promise<StartOutcome>;
  reconcile(attempt: AttemptRow): Promise<Reading>;
  name: WorkerKindName; // "atc.session", "noslop.cli", "script"
  needs?: readonly HostNeed[]; // a runner claims only phases whose worker it can host
  targets?: readonly TargetDescriptor[]; // the targets it can run on, with their capabilities
}

/**
 * `agentSession` is atc's `agentSessionID`: the id Claude Code puts on its telemetry as `session.id`.
 * It is the only join from a request record to its attempt, so the runner binds every one it sees
 * in `attempt_sessions` and writes `boxxy.attempt.session_bound`. It may be null at start; a later
 * reading carries it.
 */
export type StartOutcome =
  | { kind: "started"; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: "refused"; reason: string } // atc answered no; nothing runs
  | { kind: "unknown"; reason: string }; // no answer; the attempt goes to reconciling

// `refused`: atc answered with a typed error, such as a failed input check or an unknown agent.
// `unknown`: no answer, a dropped socket, or a timeout.

// Settle sets the attempt's `endedAt` to the tick's `now`; atc's session list gives no end time.
export type SessionReading =
  | { kind: "running"; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: "ended"; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: "absent" }; // no session named `boxxy/<attempt_id>` in atc's session list
// worker-atc maps atc's states: `done` and `exited` read as `ended`; `running`, `needs_you` and any
// state it doesn't know read as `running`, and an unknown state logs a warning. When the list holds
// more than one session with the name, a live one wins, then the newest.

/** The reading shape every worker kind's `reconcile` returns, so the runner's table applies to all. */
export type WorkerReading = { readonly kind: "running" | "ended" | "absent" };

/**
 * The exact request `worker-atc` sends to atc's `session.spawn`. Stored with the claim and hashed,
 * so a retry resends the same payload. It carries no telemetry stamp: spend joins to the attempt by
 * the agent's own session id (see `SessionReading` and `CostReader`), and telemetry is switched on
 * per session through atc's own config. Slice 1. Owner: slice-1.md "claimNext" step 6.
 */
export type SpawnRequest = {
  readonly cwd: string; // the repo's configured local path; the prompt tells the agent to make its own worktree. Built: `cwd` or a git `source` (v1-lifecycle.md, "The atc worker")
  readonly prompt: string; // the rendered template
  readonly agent: string;
  readonly model: string;
  readonly effort: Effort;
  readonly pluginDirs: readonly string[]; // the boxxy Claude Code plugin folder
  readonly name: `boxxy/${string}`; // `boxxy/<attempt_id>`; reconcile finds the session by it
  readonly idempotencyKey: AttemptId;
};

/** What a runner must offer to host a worker kind. Later. Owner: core-model.md "Workers". */
export type HostNeed =
  | { readonly kind: "atc-agent"; readonly agent: string }
  | { readonly kind: "atc-target"; readonly target: string }
  | { readonly kind: "repo-checkout"; readonly repo: RepoName }
  | { readonly kind: "binary"; readonly name: string }; // such as `noslop` or `gh`

/** Adding a worker kind: a `script` worker with its own request and reading types. Later. */
export type ScriptRequest = { readonly attempt: AttemptId; readonly command: readonly string[]; readonly cwd: string };
export type ScriptReading = { readonly kind: "running"; readonly pid: number } | { readonly kind: "ended"; readonly exitCode: number; readonly endedAt: Instant } | { readonly kind: "absent" };
declare const runScript: (request: ScriptRequest) => Promise<StartOutcome>;
declare const findScript: (attempt: AttemptId) => Promise<ScriptReading>;

export const exampleScriptWorker: WorkerKindLater<ScriptRequest, ScriptReading> = {
  name: workerKindName("script"),
  needs: [{ kind: "binary", name: "git" }],
  start: (request) => runScript(request),
  reconcile: (attempt) => findScript(attempt.id),
};

// ── Target providers (later; inside worker-atc only) ───────────────────────────────────────────

/**
 * What a target can do. Capabilities flow up from atc's target providers through the worker kind;
 * no module reaches through to a provider. Later. Owner: core-model.md "Workers".
 */
export type TargetCapabilities = {
  readonly suspend: boolean; // an imp suspends while it waits on an ask
  readonly resume: "in-place" | "from-transcript"; // a local session stops and resumes from its transcript
  readonly memory: { readonly limitMiB: number } | "host";
  readonly network: "open" | "allowlist" | "none";
};

export type TargetDescriptor = { readonly name: string; readonly capabilities: TargetCapabilities }; // "local-pty", "imp"

/**
 * worker-atc's view of one atc target provider. A boxxy-side interface, so a new target is a new
 * provider object in the adapter and no module changes. Later. Owner: core-model.md "Workers".
 */
export interface TargetProvider {
  readonly descriptor: TargetDescriptor;
  /** How a session on this target waits on an ask, from its capabilities. */
  waitOnAsk(): "suspend" | "stop";
}

export const exampleImpTarget: TargetProvider = {
  descriptor: { name: "imp", capabilities: { suspend: true, resume: "in-place", memory: { limitMiB: 8192 }, network: "allowlist" } },
  waitOnAsk: () => "suspend",
};

// How the hooks and `attempt.*` calls find their attempt before the runner records the atc session
// id: slice-1.md "Links to commits and PRs".

// ── FactSink (slice 1, verbatim) ───────────────────────────────────────────────────────────────

/** Appends outbox facts to pepys. Slice 1. Owner: slice-1.md "Facts and the outbox". */
export interface FactSink {
  // `rejected`: pepys refused the batch, with its error. The sender stops and the rows stay unsent.
  append(facts: OutboxFact[]): Promise<"accepted" | { kind: "unknown"; reason: string } | { kind: "rejected"; error: string }>;
}

// ── Fact reader (slice 1: the cost reader; later: replay and queries) ──────────────────────────

/** One row of `boxxy.costToLand`: per landed item and model. Slice 1. Owner: slice-1.md "The pepys consumer and the query". */
export type CostToLandRow = {
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
  readonly totalInputTokens: number; // input + cache read + cache creation
  readonly costUsd: number; // modelled at list price, not billed
};
/**
 * The query joins telemetry `session.id` to `agent_session` in the consumer's
 * `boxxy_attempt_sessions`, at read time, so an attempt's cost sums the records of all its
 * sessions, and a record sent before its row existed still joins. pepys defines
 * it with its own `defineQuery` and zod 4 schemas, the library pepys's API uses; facts-pepys
 * parses the rows with zod before they leave the adapter.
 */
export type CostToLandInput = { readonly repo?: string; readonly landedFrom?: string; readonly landedTo?: string }; // ISO 8601

/** pepys's `boxxy.costToLand`, for `boxxy cost`. Slice 1 (`createCostReader(config)` in facts-pepys). */
export interface CostReader {
  costToLand(input: CostToLandInput): Promise<CostToLandRow[]>;
}

/** The pepys queries boxxy reads, by name. Each later query adds an entry. */
export type Queries = {
  "boxxy.costToLand": { readonly input: CostToLandInput; readonly output: readonly CostToLandRow[] };
};

/**
 * Reads pepys facts by stream offset, never by source time, and runs named queries. Later: explain,
 * replay, metrics and capacity readings use it. Owner: dispatch.md "The observation boundary".
 */
export interface FactReader {
  offsets(streams: readonly StreamName[]): Promise<Readonly<Record<StreamName, number>>>;
  read(stream: StreamName, range: { readonly after: number; readonly upTo: number }): AsyncIterable<FactEnvelope<FactMap>>;
  query<N extends keyof Queries>(name: N, input: Queries[N]["input"]): Promise<Queries[N]["output"]>;
}

// ── Forge (slice 1, verbatim; the train extends it in 09-merge-train.ts) ───────────────────────

/** Reads PRs and their commits. Slice 1. Owner: slice-1.md "The GitHub adapter". */
export interface Forge {
  readPullRequest(ref: PullRequestRef): Promise<PullRequestReading | "not-found">;
  listOpenPullRequests(repo: RepoName): Promise<PullRequestRef[]>;
}

export type PullRequestReading = {
  url: string; // the PR's web URL, for `boxxy.evidence.pr_linked` and the `pr` evidence `ref`
  state: "open" | "closed" | "merged";
  mergedAt: Instant | null;
  mergeCommit: CommitSha | null;
  commits: { sha: CommitSha; message: string }[];
};

// ── Asks, grants and ask channels (later; core-model.md "Asks and grants") ─────────────────────

/** One exact action an ask approves. Its hash binds the answer. */
export type ExactAction = { readonly kind: string; readonly params: JsonValue }; // "experiment.promote" + verdict hash; "sign-off" + draft hash

/** An ask: one exact action, bound by its hash, and the cause that opened it. Later. */
export type Ask = {
  readonly id: AskId;
  readonly action: ExactAction;
  readonly actionHash: ContentHash;
  readonly cause: EntityRefLater; // the item, attempt, unit or experiment that opened it
  readonly closesWhen: Condition | null; // the ask withdraws itself when this holds
  readonly alwaysAsk: boolean; // answering needs a confirmation bound to the person; never granted
  readonly openedAt: Instant;
};

export type AskAnswer =
  | { readonly kind: "approve"; readonly actionHash: ContentHash } // must equal the ask's hash
  | { readonly kind: "reject"; readonly reason: string }
  | { readonly kind: "always-allow"; readonly actionHash: ContentHash }; // becomes a grant for this exact action

/** A standing "always allow" for one exact action, never a category. Every act under it is logged with its id and version. Later. */
export type Grant = {
  readonly id: GrantId;
  readonly version: number;
  readonly actionHash: ContentHash;
  readonly grantedBy: ActorRefLater;
  readonly at: Instant;
  readonly revokedAt: Instant | null;
};

/**
 * Where the owner sees asks: a CLI, the owner's own session, a phone connector. Quiet hours are
 * the channel's availability. Asks queue, and the owner sees one at a time. Later.
 */
export interface AskChannel {
  readonly name: string;
  readonly confirmsPerson: boolean; // answers here carry a confirmation bound to the person, such as a passkey
  availability(now: Instant): { readonly open: true } | { readonly open: false; readonly until: Instant | null };
  show(ask: Ask): Promise<"shown" | { readonly kind: "unknown"; readonly reason: string }>;
  withdraw(ask: AskId): Promise<void>;
}

/** Adding an ask channel: the owner's terminal, closed during quiet hours. */
export const exampleTerminalChannel: AskChannel = {
  name: "cli",
  confirmsPerson: false,
  availability: (now) => {
    const hour = Math.floor((now % 86_400_000) / 3_600_000);
    return hour >= 22 || hour < 7 ? { open: false, until: null } : { open: true };
  },
  show: async () => "shown",
  withdraw: async () => undefined,
};

// ── Clock (app side) ───────────────────────────────────────────────────────────────────────────

/**
 * The clock. Only the apps hold it: the runner loop reads `now()` once per tick and passes it to
 * every module call as `now: Instant`, so a test or a replay sets time. Slice 1. Owner: layout.md
 * "Import pins", slice-1.md "Ports and adapters".
 */
export interface Clock {
  now(): Instant;
}

/** Ids come into modules as a function argument too (`newId` on claimNext). Slice 1. */
export type NewId = () => string;
