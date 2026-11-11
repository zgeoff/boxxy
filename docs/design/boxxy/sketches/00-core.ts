// 00-core.ts: ids, time, actors, the core records, recipes, the rules version, the fact envelope
// and the slice 1 fact catalog.
//
// Package: @boxxy/model (libs/model). `ContentHash` and `hashTree` are in @boxxy/content-hash
// (libs/content-hash), and model re-exports `ContentHash`. Owning docs: core-model.md, slice-1.md
// "The store schema" and "Facts and the outbox".
//
// Every type a store row, a fact or a port carries starts here. Rows use camelCase for the slice 1
// columns; the store adapter maps them to snake_case. The build close-out's shape sits here too,
// because a fact and a row carry it; its parser is in @boxxy/closeout (06-closeouts.ts).

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// Settle builds its fact from the catalog, so a wrong payload fails the typecheck, and the store
// writes it to the outbox in the same transaction as the attempt row.

export const exampleSettledFact: NewFact<"boxxy.attempt.settled"> = {
  id: factId("manual:0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30"),
  type: "boxxy.attempt.settled",
  entity: "boxxy:attempt:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77",
  actor: "boxxy:runner:runner-1",
  payload: { state: "failed", failure: "session-lost", endedAt: instant(1_762_300_000_000), criteria: [], matched: [], frictionDropped: 0 },
};

// ── Brands ─────────────────────────────────────────────────────────────────────────────────────

declare const brand: unique symbol;
/** A nominal type over a primitive, so an `ItemId` never passes where an `AttemptId` belongs. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/**
 * Brand constructors. @boxxy/model holds one zod schema per brand in `brandSchemas`, which checks
 * each value's format at the edge: `brandSchemas.instant.parse(ms)` is `instant(ms)`. The sketches
 * declare these so the examples need no casts.
 */
export declare function instant(ms: number): Instant;
export declare function factId(id: `manual:${string}`): FactId;
export declare function phaseName(name: string): PhaseName;
export declare function pipelineName(name: string): PipelineName;
export declare function itemKindName(name: string): ItemKindName;
export declare function linkTypeName(name: string): LinkTypeName;
export declare function workerKindName(name: string): WorkerKindName;

/** Any JSON value: what a rules line, a payload or a parameter block may hold. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [k: string]: JsonValue };

// ── Ids (slice 1, core-model.md) ───────────────────────────────────────────────────────────────
// Formats. Item, attempt, decision and fact ids are lowercase UUIDv7 strings from the app's
// `newId`, which must be monotonic within a millisecond. decide breaks sort ties by item id, so
// equal keys fall back to filing order. A runner id is a stable name from the server's config
// (`[a-z0-9-]+`), because its row holds the heartbeat and the paused flag across restarts.

export type ItemId = Brand<string, "ItemId">;
export type AttemptId = Brand<string, "AttemptId">;
export type DecisionId = Brand<string, "DecisionId">;
/**
 * `manual:<uuidv7>`: the caller that builds the StoreChange makes it as `manual:${newId()}`, with the
 * `manual:` prefix pepys's envelope parser takes for a fact a producer sends. A resent fact keeps
 * its id, so a consumer drops the second copy by it.
 */
export type FactId = Brand<`manual:${string}`, "FactId">;
export type RunnerId = Brand<string, "RunnerId">;
export type AtcSessionId = Brand<string, "AtcSessionId">;
/** The agent CLI's own session id, which OTel and hook records carry. */
export type AgentSessionId = Brand<string, "AgentSessionId">;
export type CommitSha = Brand<string, "CommitSha">;
/** `owner/name`, such as `zgeoff/pepys`. */
export type RepoName = Brand<string, "RepoName">;
export type PullRequestRef = { readonly repo: RepoName; readonly number: number };
/** One entry in an item's acceptance list. */
export type CriterionId = Brand<string, "CriterionId">;
export type AskId = Brand<string, "AskId">; // later
export type GrantId = Brand<string, "GrantId">; // later

// Names that rules and registries use. Each is an open set: the registry checks them at load.
export type ItemKindName = Brand<string, "ItemKindName">; // "core.issue"
export type LinkTypeName = Brand<string, "LinkTypeName">; // "blocks"
export type PhaseName = Brand<string, "PhaseName">; // "build", "triage", "plan.judge"
export type PipelineName = Brand<string, "PipelineName">; // "contract-first"
export type PoolName = Brand<string, "PoolName">;
export type RecipeName = Brand<string, "RecipeName">; // "build-v1"
export type WorkerKindName = Brand<string, "WorkerKindName">; // "atc.session", "noslop.cli", "script"
/** A capacity source's name, such as `subscription`. */
export type SourceName = Brand<string, "SourceName">;
/** A pepys stream, such as `facts.boxxy.work`. */
export type StreamName = Brand<string, "StreamName">;
/** A lever kind is namespaced by the concept that registers it: `plan.defer`, `item.retry`. */
export type LeverKind = `${string}.${string}`;

// ── Time (slice 1) ─────────────────────────────────────────────────────────────────────────────

/**
 * Epoch milliseconds, UTC. Modules may not touch the `Date` global (layout.md), so time is a number
 * that arrives as an argument; adapters convert to and from ISO 8601 at the edge.
 */
export type Instant = Brand<number, "Instant">;
export type Minutes = number;

// ── Content addressing (slice 1, slice-1.md "Rules for slice 1") ───────────────────────────────

/** SHA-256 hex of canonical JSON. Declared in @boxxy/content-hash, with its own brand; model re-exports it. */
export type ContentHash = Brand<string, "ContentHash">;
export type RecipeHash = Brand<ContentHash, "RecipeHash">;
export type SnapshotHash = Brand<ContentHash, "SnapshotHash">;
export type DefinitionHash = Brand<ContentHash, "DefinitionHash">; // an experiment file, frozen at first exposure
/**
 * The content hash of the rules checkout's commit hash, the bytes of every file the loader read,
 * and each concept pin. rules.md calls the commit hash the rules version; slice 1 widens it to this.
 */
export type RulesVersion = Brand<ContentHash, "RulesVersion">;

/**
 * A concept pin in a rules version: `name@version` and a tree hash of the concept's TypeScript
 * source: its module file and every file inside @boxxy/planning it imports, transitively. Bun runs
 * source, so there is no built JS to hash. Libraries outside the package are pinned by the lockfile.
 */
export type ConceptPin = { readonly ref: `${string}@${number}`; readonly sourceHash: ContentHash };

/**
 * In @boxxy/content-hash, which reads no files: the caller walks the folder and passes the entries.
 * How a folder is hashed (the plugin folder, a concept's files): walk it recursively, take regular
 * files only and follow no links, write each path relative to the root with `/`, sort by those
 * paths' UTF-8 bytes, and hash the canonical JSON list of `{ path, sha256, executable }`. Slice 1.
 */
export declare function hashTree(files: readonly { readonly path: string; readonly bytes: Uint8Array; readonly executable: boolean }[]): ContentHash;

/** A file the recipe names, by path and content hash, so a moved file keeps its identity. Later. */
export type ContentRef = { readonly path: string; readonly hash: ContentHash };

// ── Actors (slice 1 strings; sender kinds later, core-model.md "Entry points") ─────────────────

/** The kind atc's daemon sets on every caller. Never taken from a value the caller supplies. */
export type SenderKind = "owner" | "session" | "connector" | "local";

/**
 * Who wrote a change. Slice 1 checks no identity and writes the first four; the kernel-bound
 * `session` kind resolves to `attempt` once the API reads atc's sender kind.
 */
export type Actor =
  | { readonly kind: "owner" } // atc's `owner` label: a program of the owner's user, not a credential
  | { readonly kind: "attempt"; readonly attempt: AttemptId } // a session that holds a live attempt
  | { readonly kind: "runner"; readonly runner: RunnerId }
  | { readonly kind: "hook"; readonly attempt: AttemptId } // a boxxy hook command inside the attempt's session
  | { readonly kind: "connector"; readonly connector: string } // later: another system on the owner's behalf
  | { readonly kind: "local" }; // later: a local program with no session

/**
 * The serialised actor on a fact envelope and a row. pepys's envelope parser takes an entity id as
 * the actor, so each is `boxxy:<kind>:<id>`. Slice 1 writes these four.
 */
export type ActorRef = "boxxy:owner:local" | `boxxy:runner:${string}` | `boxxy:attempt:${string}` | `boxxy:hook:${string}`;
// later: `ActorRefLater` below adds the connector and local actors.

// ── Items and their derived state (slice 1, core-model.md "Items") ─────────────────────────────

/** The kinds of evidence a criterion can need, and an evidence row can hold. */
export type EvidenceKind = "pr" | "commit" | "test" | "ci-run" | "live-check";

/**
 * One acceptance criterion. `item.file` gives the ids `a1`, `a2`, … in order. `evidence` starts
 * empty; settle copies in the evidence ids that the latest valid close-out cites for the criterion.
 */
export type Criterion = { readonly id: CriterionId; readonly text: string; readonly evidence: readonly FactId[] };

/** The `items` row. Later kinds add typed `fields`, checked by the kind's schema. */
export type ItemRow = {
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
};
// later: `ItemRowLater` below adds `fields` (the kind's typed fields, checked by its schema) and
// `pipeline` (a per-item pipeline override, set by `item.edit`). Slice 3 or after.

export type ItemState = "idea" | "ready" | "running" | "blocked" | "waiting" | "done" | "archived";
export type WaitingReason = "PR open" | "no PR linked" | "attempts used up";

/** The first row of slice-1.md's derived state table whose condition holds. */
export type DerivedState =
  | { readonly state: Exclude<ItemState, "waiting"> }
  | { readonly state: "waiting"; readonly reason: WaitingReason };

/** An item with its state derived at `now`. Nobody sets a state. */
export type ItemView = ItemRow & { readonly derived: DerivedState };

/** Every row `deriveItemState` reads for one item. */
export type ItemRows = {
  readonly links: readonly LinkRow[]; // live links where the item is the target
  readonly blockerStates: ReadonlyMap<ItemId, ItemState>; // each blocking source's own state
  readonly levers: readonly LeverRow[];
  readonly attempts: readonly AttemptRow[];
  readonly liveLease: LeaseRow | null;
  readonly pullRequests: readonly PullRequestRow[];
  readonly maxAttempts: number; // the kind's `maxAttempts` for the item's current phase
};

/** Derived item state: pure, in @boxxy/model. Slice 1. Owner: slice-1.md "Derived item state". */
export declare function deriveItemState(item: ItemRow, rows: ItemRows): DerivedState;

/**
 * The live levers at `now`: not undone by a later lever and not past `expiresAt`. Pure, in
 * @boxxy/model, so the SQLite store, the memory fake and planning's tests apply one rule. Slice 1.
 */
export declare function liveLevers(levers: readonly LeverRow[], now: Instant): LeverRow[];

/** Each kind's `maxAttempts` per phase, from `LoadedRules`; the store readers take it to derive state. */
export type MaxAttemptsByKind = ReadonlyMap<ItemKindName, ReadonlyMap<PhaseName, number>>;

/** An item with its live levers, as `item.list` and `boxxy item show` print it. Slice 1. */
export type ItemWithLevers = ItemView & { readonly levers: readonly LeverRow[] };

// ── Links (slice 1: `blocks` only; core-model.md "Links") ──────────────────────────────────────

export type LinkRow = {
  readonly source: ItemId; // for `blocks`: the blocking item
  readonly target: ItemId; // for `blocks`: the blocked item
  readonly type: LinkTypeName;
  readonly addedBy: ActorRef;
  readonly addedAt: Instant;
  readonly removedAt: Instant | null;
};

// ── Levers (slice 1, rules.md "Levers as facts") ───────────────────────────────────────────────

/** One lever row. Slice 1 kinds: plan.defer, plan.undefer, plan.expedite, plan.unexpedite, item.retry. */
export type LeverRow = {
  readonly seq: number;
  readonly kind: LeverKind;
  readonly item: ItemId;
  readonly until: Instant | null; // when a defer ends
  readonly expiresAt: Instant | null; // when an expedite ends
  readonly reason: string | null; // null for an undo lever or `item.retry` given no reason
  readonly actor: ActorRef;
  readonly at: Instant;
};
// later: `LeverRowLater` below adds `params` (a rank value, a pin target, admitted pools), for the
// rank, pin and admit levers. Slice 3 or after.

// ── Attempts and leases (slice 1, core-model.md "Attempts", dispatch.md "Leases and generations") ─

export type AttemptState = "starting" | "running" | "reconciling" | "succeeded" | "failed";
export type LiveAttemptState = Extract<AttemptState, "starting" | "running" | "reconciling">;

/** Failure reasons the core writes. A close-out's `blocked` or `abandoned` reason text is the rest. */
export type KnownFailure =
  | "spawn-refused"
  | "session-lost"
  | "spawn-lost"
  | "closeout-missing"
  | "cancelled" // later: the mid-flight `cancel` response
  | "restarted" // later: the mid-flight `restart` response
  | "over-cap"; // later: a spend cap per phase and model

export type AttemptRow = {
  readonly id: AttemptId;
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly number: number; // from 1, per item phase
  readonly runner: RunnerId;
  readonly recipeHash: RecipeHash;
  readonly rulesVersion: RulesVersion;
  readonly pool: PoolName;
  readonly slot: number;
  readonly slotGen: number; // the slot's `gen` after this attempt's take; settle names it in `under.slot`
  readonly leaseGen: number;
  readonly spawnRequest: JsonValue; // the exact request, so a retry resends the original payload
  readonly spawnRequestHash: ContentHash;
  readonly state: AttemptState;
  readonly failure: KnownFailure | string | null;
  readonly atcSession: AtcSessionId | null; // the current atc session, which reconcile reads
  readonly closeOut: BuildCloseOut | null; // the latest valid close-out; later phase kinds widen it
  readonly claimedAt: Instant;
  readonly startedAt: Instant | null;
  readonly endedAt: Instant | null;
};

/**
 * One agent session an attempt carried. An attempt can carry more than one, for example after atc
 * respawns its session. The primary key is `(attempt, agentSession)`, and a unique index on
 * `agentSession` gives each agent session to one attempt. The cost query joins telemetry
 * `session.id` to `agentSession` here. Slice 1. Owner: slice-1.md "The session-id join".
 */
export type AttemptSessionRow = {
  readonly attempt: AttemptId;
  readonly agentSession: AgentSessionId; // the agent CLI's own session id
  readonly atcSession: AtcSessionId; // atc's session that carried it
  readonly seenAt: Instant; // when the runner first saw the pair
};

/** One item-phase lease. A partial unique index allows one live lease per item phase. */
export type LeaseRow = {
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly attempt: AttemptId;
  readonly gen: number; // one more than the last lease on this item phase
  readonly takenAt: Instant;
  readonly releasedAt: Instant | null;
};

/** One pool slot; `holder` is the slot lease. Rows are never deleted (slice-1.md "Store rules"). */
export type PoolSlotRow = {
  readonly pool: PoolName;
  readonly slot: number;
  readonly holder: AttemptId | null;
  readonly gen: number; // one higher on each take; a release that names an older gen changes nothing
  readonly retired: boolean; // above the pool's slot count; keeps its holder until that attempt settles
};

/** Where a decision had read up to: the store version and the offset in each pepys stream. */
export type ObservationBoundary = {
  readonly storeVersion: number;
  readonly pepysOffsets: Readonly<Record<StreamName, number>>; // `{}` in slice 1
};

export type DecisionRow = {
  readonly id: DecisionId;
  readonly attempt: AttemptId;
  readonly item: ItemId;
  readonly pool: PoolName;
  readonly rulesVersion: RulesVersion;
  readonly snapshotHash: SnapshotHash;
  readonly storeVersion: number;
  readonly pepysOffsets: ObservationBoundary["pepysOffsets"];
  readonly faults: readonly FaultRecord[];
  readonly at: Instant;
};

/** A plug-in call or a propagation line that threw. 04-planning.ts's `Fault` is this shape. */
export type FaultRecord = {
  readonly plugin: string; // signal, gate, waiver or filter field name, or `propagation:<signal>:<link>`
  readonly kind: "signal" | "gate" | "waiver" | "admission" | "propagation" | "filter-field" | "pool-gate";
  readonly item: ItemId | null;
  readonly error: string;
};

// ── Evidence and pull requests (slice 1, close-outs.md "Linking attempts to commits and PRs") ──

export type EvidenceSource = "hook" | "trailer" | "agent" | "watch"; // `watch`: the PR watch

export type EvidenceRow = {
  readonly factId: FactId; // a close-out cites this id as the criterion's evidence
  readonly attempt: AttemptId;
  readonly kind: EvidenceKind;
  readonly ref: string; // a PR URL, a sha, a test file and name, a CI run URL, or a live check's URL or command
  readonly observed: string | null; // what the agent saw, from `--observed`
  readonly source: EvidenceSource;
  readonly at: Instant;
};

export type PullRequestRow = {
  readonly repo: RepoName;
  readonly number: number;
  readonly attempt: AttemptId;
  readonly state: "open" | "closed" | "merged";
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
  readonly checkedAt: Instant;
};

export type RunnerRow = { readonly id: RunnerId; readonly heartbeatAt: Instant; readonly paused: boolean };

// ── Recipes (slice 1 fields; later fields from core-model.md "Attempts" and capacity.md) ───────

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** What one model role in an attempt runs on. Later: a recipe declares one per role. */
export type ModelRole = "main" | "subagent" | "advisor" | "review";
export type ModelChoice = { readonly provider: string; readonly model: string };

/**
 * A recipe as `rules.yaml` declares it. Slice 1. From slice 2 the router picks the capacity source
 * at claim time, so `source` stays only as a pin for a recipe that must not be routed; the provider
 * and model stay in the recipe, because a swap is an experiment arm.
 */
export type Recipe = {
  readonly agent: string; // the atc agent id, such as `claude`
  readonly model: string;
  readonly effort: Effort;
  readonly prompt: string; // the template's path in the rules checkout
  readonly source: SourceName; // slice 1: the one capacity source; slice 2: an optional pin
};
// later: `RecipeLater` below adds `models` and `caps` (slice 2), and `skills`, `plugins` and
// `instructions` (after slice 2).

/** A spend cap on one phase and one model role. Its full shape is in 08-capacity.ts. */
export type SpendCapLine = { readonly role: ModelRole; readonly limit: { readonly usd: number } | { readonly tokens: number } };

/**
 * The exact material a recipe hash covers. Slice 1: the recipe's fields, the prompt template's
 * bytes, the plugin folder's hash and the rules version. Later: the experiment arm.
 */
export type RecipeMaterial = {
  readonly name: RecipeName;
  readonly recipe: Recipe;
  readonly promptHash: ContentHash;
  readonly pluginFolderHash: ContentHash;
  readonly rulesVersion: RulesVersion;
};
// later: `RecipeMaterialLater` below adds `arm`, the experiment arm. Slice 2.

/** A recipe as the loader resolves it. The loader can't see the plugin folder, so claimNext adds its hash. */
export type LoadedRecipe = Omit<RecipeMaterial, "pluginFolderHash">;

/** A recipe with its hash, as claimNext computes it. */
export type ResolvedRecipe = RecipeMaterial & { readonly hash: RecipeHash };

// ── The build close-out's shape (slice 1, close-outs.md "The build close-out") ─────────────────
// The shape and its zod schema live here; the parser, the criteria check and the dedupe are in
// @boxxy/closeout (06-closeouts.ts).

/**
 * A build close-out after parsing. The agent may send a friction entry with no target: the parser
 * drops it and counts it in `frictionDropped` (decision 0009). A target kind outside the list fails
 * the parse. Slice 1. Owner: slice-1.md "The build close-out".
 */
export type BuildCloseOut = {
  readonly result: { readonly kind: "built" } | { readonly kind: "blocked"; readonly reason: string } | { readonly kind: "abandoned"; readonly reason: string };
  readonly criteria: readonly { readonly criterion: CriterionId; readonly evidence: FactId }[];
  readonly openItems: readonly OpenItem[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
};

/** Work the agent found and did not do. Slice 1 files `core.issue` only. */
export type OpenItem = { readonly kind: "core.issue"; readonly title: string; readonly body: string };
// later: `OpenItemLater` below takes any item kind.
export type OpenItemLater = { readonly kind: ItemKindName; readonly title: string; readonly body: string };

/** A named change to a named target; becomes a `boxxy.proposal.recorded` fact. */
export type Friction = {
  readonly target: { readonly kind: "skill" | "rule" | "lint" | "agents-md" | "tool"; readonly name: string };
  readonly change: string;
};

// ── The fact envelope (slice 1, slice-1.md "Facts and the outbox") ─────────────────────────────
// @boxxy/model declares its own copy of pepys's envelope and depends on no pepys package, so boxxy
// builds and publishes apart from pepys. The FactSink contract suite runs against a mock of pepys's
// append route; the S1-11 live check is the first run against pepys itself.

export type EntityRef =
  | `boxxy:item:${string}`
  | `boxxy:link:${string}:${string}:${string}`
  | `boxxy:attempt:${string}`
  | `boxxy:decision:${string}`
  | `boxxy:runner:${string}`;
// later: `EntityRefLater` below adds the later entities: experiment, source, unit, ask.

/** pepys's envelope, as boxxy sends it. `payload` gains `storeVersion` when the sender sends it. */
export type FactEnvelope<M extends FactMap = SliceOneFacts, T extends keyof M & string = keyof M & string> = {
  readonly id: FactId;
  readonly type: T;
  readonly v: 1;
  readonly api: "boxxy/1";
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly at: Instant;
  readonly payload: M[T] & { readonly storeVersion: number };
};

/**
 * A fact as a change carries it. The caller makes its id; the store takes the time from the
 * change's `at` and the store version from the outbox row.
 */
export type NewFact<T extends keyof M & string, M extends FactMap = SliceOneFacts> = {
  readonly id: FactId;
  readonly type: T;
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly payload: M[T];
};

/** An outbox row: the store's own copy of a fact until pepys accepts it. */
export type OutboxFact = {
  readonly seq: number; // the row's order, and the store version it made
  readonly factId: FactId;
  readonly type: string;
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly at: Instant;
  readonly payload: JsonValue;
  readonly sentAt: Instant | null;
};

export type FactMap = { readonly [type: string]: unknown };

/** The slice 1 fact catalog, on stream `facts.boxxy.work`. Each type has one write path. */
export type SliceOneFacts = {
  "boxxy.item.filed": ItemRow; // `item.file`, and settle for `openItems`
  "boxxy.item.edited": Partial<Pick<ItemRow, "title" | "outcome" | "acceptance">>; // `item.edit`
  "boxxy.item.closed": { readonly reason: string }; // `item.close`
  "boxxy.link.added": Pick<LinkRow, "source" | "target" | "type">; // `link.add`
  "boxxy.link.removed": Pick<LinkRow, "source" | "target" | "type">; // `link.remove`
  "boxxy.lever.recorded": LeverRow; // `plan.*` and `item.retry`
  "boxxy.attempt.claimed": {
    readonly item: ItemId;
    readonly phase: PhaseName;
    readonly number: number;
    readonly pool: PoolName;
    readonly slot: number;
    readonly gen: number;
    readonly recipeHash: RecipeHash;
    readonly rulesVersion: RulesVersion;
  }; // `claimNext`
  "boxxy.decision.recorded": DecisionRow; // `claimNext`
  "boxxy.attempt.started": { readonly atcSession: AtcSessionId }; // the runner, on a `started` start or reconcile
  "boxxy.attempt.reconciling": { readonly reason: string }; // the runner, on an `unknown` start
  "boxxy.attempt.reconciled": { readonly atcSession: AtcSessionId }; // reconcile
  // The runner, in the same StoreChange as the `attempt_sessions` row, from a `started` outcome or
  // any reading that carries an agent session id the attempt does not hold yet.
  "boxxy.attempt.session_bound": Pick<AttemptSessionRow, "atcSession" | "agentSession" | "seenAt">;
  "boxxy.attempt.closed_out": { readonly closeOut: BuildCloseOut }; // `attempt.closeOut`
  "boxxy.attempt.settled": {
    readonly state: "succeeded" | "failed";
    readonly failure: string | null;
    readonly endedAt: Instant;
    readonly criteria: readonly { readonly criterion: CriterionId; readonly evidence: readonly FactId[] }[]; // copied into the item's acceptance
    readonly matched: readonly ItemId[]; // open items whose `openItems` entry matched them; settle filed nothing for them
    readonly frictionDropped: number; // friction entries with no target, from the close-out
  }; // settle
  "boxxy.evidence.recorded": Pick<EvidenceRow, "kind" | "ref" | "observed">; // `attempt.evidence`
  "boxxy.evidence.pr_linked": { readonly repo: RepoName; readonly number: number; readonly url: string }; // `evidence.recordPr`, PR watch
  "boxxy.evidence.commit_linked": { readonly repo: RepoName; readonly sha: CommitSha; readonly pr: number }; // PR watch
  "boxxy.pr.merged": { readonly repo: RepoName; readonly number: number; readonly mergedAt: Instant; readonly mergeCommit: CommitSha }; // PR watch
  "boxxy.pr.closed": { readonly repo: RepoName; readonly number: number }; // PR watch
  "boxxy.proposal.recorded": Friction; // settle, for friction
  "boxxy.runner.paused": { readonly runner: RunnerId }; // `runner.pause`
  "boxxy.runner.resumed": { readonly runner: RunnerId }; // `runner.resume`
};

/** Matches facts by type, and optionally entity and payload fields. Rules data, never logic. */
export type FactMatch = {
  readonly type: string;
  readonly entity?: EntityRef;
  readonly where?: { readonly [path: string]: string | number | boolean };
};

// ── Later extensions of the slice 1 shapes ─────────────────────────────────────────────────────
// Later slices type against these. Each slice 1 shape above holds only what slice 1 builds.

/** The item row with a kind's typed fields and a per-item pipeline. Slice 3 or after. */
export type ItemRowLater = ItemRow & {
  readonly fields: { readonly [field: string]: JsonValue }; // checked by the kind's schema
  readonly pipeline: PipelineName | null; // set by `item.edit`
};
export type ItemViewLater = ItemRowLater & { readonly derived: DerivedState };

/** The lever row with its parameters: a rank value, a pin target, admitted pools. Slice 3 or after. */
export type LeverRowLater = LeverRow & { readonly params: { readonly [k: string]: JsonValue } };

/** The recipe with a model per role and spend caps (slice 2), and the files it pins (after slice 2). */
export type RecipeLater = Recipe & {
  readonly models?: Readonly<Partial<Record<ModelRole, ModelChoice>>>;
  readonly caps?: readonly SpendCapLine[]; // 08-capacity.ts
  readonly skills?: readonly ContentRef[];
  readonly plugins?: readonly ContentRef[];
  readonly instructions?: readonly ContentRef[]; // AGENTS.md and CLAUDE.md in force
};

/** The recipe material with the experiment arm. Slice 2. */
export type RecipeMaterialLater = RecipeMaterial & {
  readonly arm: { readonly experiment: string; readonly arm: "champion" | "challenger" } | null;
};

/**
 * The later actors, as entity ids. Proposed: pepys's parser takes any `boxxy:<kind>:<id>`; the docs
 * name no id for these two yet.
 */
export type ActorRefLater = ActorRef | `boxxy:connector:${string}` | `boxxy:local:${string}`;

/** Later entities: experiment, source, unit, ask. */
export type EntityRefLater = EntityRef | `boxxy:${string}:${string}`;
