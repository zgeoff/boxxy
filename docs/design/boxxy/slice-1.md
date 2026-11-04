# Slice 1

This is the build spec for slice 1, the first working version of boxxy. An agent builds slice 1 from
this doc and the docs it links, with no other context. Slice 1 dispatches real build work for one
repo, and measures what each piece of work cost to land, meaning to get its PR merged, by model.

The decision behind this doc is [0014: the first slice](../../decisions/0014-first-slice.md). Each
section below links the design doc that owns the general rule, and this doc fixes what slice 1
builds.

## Terms

Where another design doc owns a term, the link goes to that doc.

| Term | Meaning |
| --- | --- |
| item | A typed piece of work. Slice 1 has one kind, `core.issue`, an issue to build ([core model](./core-model.md#items)). |
| phase | One step of an item kind's pipeline. Slice 1's one phase is `build` ([core model](./core-model.md#phases)). |
| item phase | One phase of one item, such as the `build` phase of one issue. |
| attempt | One run of one phase on one item, in one agent session ([core model](./core-model.md#attempts)). |
| close-out | The typed report an agent sends at the end of its attempt ([close-outs](./close-outs.md)). |
| recipe | What an attempt runs with: agent, model, effort, prompt template and capacity source. Each attempt stores its recipe's content hash ([core model](./core-model.md#attempts)). |
| capacity source | What pays for an attempt's model use, such as a subscription account's usage window or a pay-per-token provider's balance ([capacity](./capacity.md#capacity-sources)). |
| the owner | The person who runs boxxy. |
| lever | An owner command that changes the order of work now, such as defer or expedite. boxxy stores each lever as a row in the store's `levers` table, with its actor, time and reason ([rules](./rules.md#levers-as-facts)). |
| fact | A record of one change, in pepys. boxxy writes a fact for every change to its store. |
| the fact catalog | The list of boxxy fact types, with a schema for each payload, in `@boxxy/model`. [Facts and the outbox](#facts-and-the-outbox) lists the types. |
| concept | One module that adds one planning idea, such as defer. A concept registers one or more plug-ins ([planning](./planning.md#concepts)). |
| `buildFrame` and `decide` | `buildFrame` runs the plug-ins over the ready items and returns the frame. `decide` reads the frame and the pools, and returns the picks ([planning](#planning-buildframe-and-decide)). |
| frame | What `buildFrame` returns: the ready items, the holds and signal values the plug-ins gave them, and the faults. |
| plug-in | A function of one plug-in kind, which `buildFrame` runs over each item. Slice 1 has plug-ins of three kinds: signal, gate and waiver. |
| signal | A plug-in kind that gives an item a number. A pool sorts items by signals, lowest first. |
| gate | A plug-in kind that holds an item back, with a reason. |
| waiver | A plug-in kind that lifts one gate's hold on one item. |
| admission | A plug-in kind that widens which pools may take an item. Slice 1 has none. |
| view | A plug-in kind that computes a read-only result from the frame, such as `explain`. Slice 1 has none. |
| propagation | A line in the rules that carries a signal's value across links of one type. `buildFrame` runs each line. A propagation line is rules data, not a plug-in. |
| pool | A named set of slots, with a filter for the work it takes and the signals it sorts by ([planning](./planning.md#pools)). |
| claim | What `claimNext` makes when it picks an item phase: an attempt and the two leases it runs under. |
| runner | The loop in the server that claims attempts, starts them and settles them ([the runner loop](#the-runner-loop)). |
| lease | The store's record that one attempt holds part of a claim. Each claim takes two leases. The item-phase lease is a row in `leases`, and makes the attempt the only live one on its item phase. The slot lease is the `holder` column of a `pool_slots` row, and holds one slot in a pool ([dispatch](./dispatch.md#leases-and-generations)). |
| lease generation | A number on each item-phase lease, one higher than the last lease on the same item phase. Every write about an attempt carries it, and the store refuses the write when the lease is released or the number differs. |
| the outbox | A table in the boxxy store that holds each fact until boxxy sends it to pepys. A change and its outbox rows commit in one transaction. |
| pepys | [pepys](https://github.com/zgeoff/pepys), an event store. boxxy sends its facts to pepys and reads cost from it. |
| pepys consumer | Code in a pepys deployment that reads one fact stream and keeps read tables from it. |
| fact mode | The pepys consumer mode that reads one stream in order, one fact at a time ([pepys consumers](https://github.com/zgeoff/pepys/blob/main/docs/design/pepys/consumers.md#input-modes)). |
| atc | [atc](https://github.com/zgeoff/atc) runs agent sessions. boxxy starts each attempt with atc's `session.spawn`. |
| hq | [hq](https://github.com/zgeoff/hq), the tool that hands tasks to agents. hq dispatches the tasks that build boxxy, the units in [build order](#build-order). |
| the local OTLP sink | An OTLP receiver on the owner's machine that writes the telemetry records it gets to files. boxxy doesn't build it, and S1-09's live check needs one running. |
| explain | A command that shows why boxxy picked an item, from its decision row. Slice 1 doesn't build it. |
| replay | A rerun of `decide()` on a decision row's recorded inputs. Slice 1 doesn't build it. |
| import zones | The `zgeoff/import-zones` lint rule. Each pin in it sets the one package that may import a library ([layout](./layout.md#import-pins)). |
| gunshi | The CLI library that the `boxxy` commands use. |
| msw | An HTTP mocking library for tests. |
| wringer | [wringer](https://github.com/zgeoff/wringer), a repo that publishes npm packages. boxxy copies its repo setup. |
| repo-sync | The workflow that copies shared files from [zgeoff/tools](https://github.com/zgeoff/tools) into each repo ([tech stack](./tech-stack.md#what-repo-sync-delivers)). |

## Scope

Slice 1 builds:

- one item kind, `core.issue`, with a pipeline of one phase, `build`;
- one pool;
- the boxxy store: SQLite through Kysely in `adapters/store-sqlite`, holding items, attempts and
  leases;
- three planning concepts, the pool, defer with expedite as its waiver, and expedite propagation
  over links, which register four plug-ins: the `oldest` signal, the `defer` gate, the
  `expedite-lifts-defer` waiver and the `expedite` signal ([the slice 1 concepts](#the-slice-1-concepts));
- the build worker through atc, in `adapters/worker-atc`, which sets `OTEL_RESOURCE_ATTRIBUTES` on
  each session;
- the typed build close-out ([close-outs](./close-outs.md));
- links from attempts to commits, by a commit trailer, and to PRs, by a Claude Code hook and the PR
  watch;
- one pepys consumer and one query: cost to land per item, by model.

### Out of scope

Slice 1 leaves out each of these. Where slice 1 still needs the job done, each line ends with what
does it.

- The merge train ([merge train](./merge-train.md)). The repo's review gate merges every PR.
- The router and the pacing gate ([capacity](./capacity.md)). Each recipe sets one capacity
  source.
- The model-swap evaluation on a pay-per-token provider
  ([capacity](./capacity.md#the-model-swap-eval)).
- Experiments ([measurement](./measurement.md)). Slice 1 builds the cost query that experiments
  read.
- The forecast, the roadmap, rank and deadlines.
- Asks, grants and the judgement pool. An ask is a question boxxy queues for the owner, and a grant
  is the owner's standing answer to one exact ask ([core model](./core-model.md#asks-and-grants)).
  The judgement pool gives a stuck item to an agent, which decides what happens to it next
  ([planning](./planning.md#the-judgement-pool)). In slice 1, an item that uses up its attempts
  waits until the owner runs `boxxy item retry`, which calls `item.retry`.
- A confirmation that only the owner can give before an expedite takes effect, such as a passkey
  approval ([core model](./core-model.md#entry-points)). In slice 1, the API listens on `127.0.0.1`
  only, and any program on the machine may expedite.
- `explain` and replay. Each decision row records their inputs: the rules version, the snapshot
  hash, the store version and the plug-in faults. Slice 1 writes decision rows and never reads them.
- A standby runner. Slice 1 runs one runner, which reconciles every live attempt when it starts.

### The trial on pepys

Slice 1 runs a trial on one repo, `zgeoff/pepys`, beside hq. A fault in boxxy must never block work
on pepys outside boxxy. These rules keep that true:

- The trial adds no git hook, workflow, required check or agent file to pepys's development flow.
  S1-12 adds the consumer and the query to pepys's deployment code.
- boxxy's Claude Code hooks run only in the sessions boxxy starts, through the plugin folder it
  passes to atc at spawn. Each hook exits 0 within 5 seconds when the boxxy API is down or the
  session holds no attempt.
- The `Boxxy-Attempt` trailer is an extra line in a commit message, and only boxxy reads it.
- An item lives in boxxy or in hq, never in both. The owner files trial work for pepys in boxxy
  only.
- The repo's review gate reviews and merges PRs from boxxy attempts like any other PR. boxxy only
  watches them.
- To stop new claims, run `boxxy runner pause`. When the boxxy server stops, the atc sessions it
  started keep running. Work outside boxxy never waits on boxxy.

## Packages

Slice 1 creates these packages and no others. Each folder name is the package name under
`@boxxy/`, and the folder's parent sets the package's dependency tag ([layout](./layout.md)). Every
package publishes ([tech stack](./tech-stack.md#every-package-publishes)).

The apps, tagged `app`:

- `@boxxy/cli`, in `apps/cli`, holds the `boxxy` commands, built with gunshi, the hook commands and
  the Claude Code plugin folder.
- `@boxxy/server`, in `apps/server`, holds the Elysia server with the oRPC router, the runner loop,
  the outbox sender and the PR watch.

The modules, tagged `module`:

- `@boxxy/model`, in `modules/model`, holds the ids, the item, link, lever and attempt types,
  derived state, the fact catalog and the parsers.
- `@boxxy/rules`, in `modules/rules`, holds the rules loader, the plug-in kind registry and the
  rules version.
- `@boxxy/planning`, in `modules/planning`, holds `buildFrame`, `decide` and the slice 1 concepts.
- `@boxxy/dispatch`, in `modules/dispatch`, holds the ports, `claimNext`, settle, the commands, and
  the logic of the outbox sender and the PR watch.
- `@boxxy/closeout`, in `modules/closeout`, holds the build close-out type, its parser and the
  criteria check.

The adapters, tagged `adapter`:

- `@boxxy/store-sqlite`, in `adapters/store-sqlite`, holds the `ClaimStore` adapter: the schema, the
  migrations and the transactions.
- `@boxxy/worker-atc`, in `adapters/worker-atc`, holds the `WorkerKind` adapter for atc sessions.
- `@boxxy/facts-pepys`, in `adapters/facts-pepys`, holds the `FactSink` adapter and the reader for
  pepys's cost query.
- `@boxxy/forge-github`, in `adapters/forge-github`, holds the `Forge` adapter, which reads PRs and
  their commits.

The libs, tagged `lib`:

- `@boxxy/content-hash`, in `libs/content-hash`, holds canonical JSON and the SHA-256 hashes for
  recipes, rules versions and snapshots.
- `@boxxy/contract`, in `libs/contract`, holds the oRPC contract that the server serves and the CLI
  calls. The CLI and the server are both apps, and an app can't import another app, so the contract
  lives in a lib.

`test-utils/` holds cross-package helpers, and `e2e/` holds the end-to-end tests, which run as their
own CI job. Each package's own
fakes and factories sit in its `test-utils/` folder, exported as `./test-utils`.

## Ports and adapters

A module reaches an outside system through a port. Each port has a real adapter and a test fake. The
`dispatch` module declares all four slice 1 ports, because it is the module that drives them. Time,
ids and configuration come into modules as arguments, never through a port.

| Port | Real adapter | Test fake |
| --- | --- | --- |
| `ClaimStore` | `@boxxy/store-sqlite` | `createMemoryClaimStore()` in `@boxxy/dispatch/test-utils` |
| `WorkerKind` | `@boxxy/worker-atc` | `createFakeWorker()` in `@boxxy/dispatch/test-utils` |
| `FactSink` | `@boxxy/facts-pepys` | `createFakeFactSink()` in `@boxxy/dispatch/test-utils` |
| `Forge` | `@boxxy/forge-github` | `createFakeForge()` in `@boxxy/dispatch/test-utils` |

One contract test suite per port, in `@boxxy/dispatch/test-utils`, runs against the fake and against
the real adapter. A fake that passes the suite is safe to use in module tests.

```ts
// modules/dispatch/src/ports.ts (signatures; the types live in @boxxy/model)

interface ClaimStore {
  // BEGIN IMMEDIATE, run work, COMMIT; ROLLBACK when work throws.
  exclusive<T>(work: (tx: StoreTx) => Promise<T>): Promise<T>;
  // A read in one deferred transaction, for queries and the runner's polls.
  read<T>(work: (tx: StoreReader) => Promise<T>): Promise<T>;
}

interface StoreReader {
  readSnapshot(now: Instant): Promise<Snapshot>; // filters levers and derives item state at `now`
  readItem(id: ItemId): Promise<ItemView | null>;
  listItems(filter: ItemFilter): Promise<ItemView[]>;
  readLastLeaseGen(item: ItemId, phase: PhaseName): Promise<number>; // 0 when the item phase has no lease
  listLiveAttempts(): Promise<AttemptRow[]>;
  listSucceededAttemptsWithoutPr(): Promise<AttemptRow[]>;
  findAttemptBySession(session: AtcSessionId): Promise<AttemptRow | null>;
  listWatchedPullRequests(): Promise<PullRequestRow[]>;
  readUnsentFacts(limit: number): Promise<OutboxFact[]>;
  readRunner(id: RunnerId): Promise<RunnerRow | null>;
}

interface StoreTx extends StoreReader {
  applyChange(change: StoreChange): Promise<ApplyResult>;
  // Bookkeeping writes: outside StoreChange, no fact, no store version change.
  markFactsSent(ids: FactId[], at: Instant): Promise<void>;
  writeHeartbeat(runner: RunnerId, at: Instant): Promise<void>;
  markPullRequestChecked(ref: PullRequestRef, at: Instant): Promise<void>;
}

type StoreChange = {
  under?: { item: ItemId; phase: PhaseName; gen: number }; // the live lease generation it writes under
  writes: RowWrite[]; // inserts and guarded updates, typed per table in @boxxy/model
  facts: NewFact[]; // outbox rows, written in the same transaction as the writes
};

type ApplyResult =
  | { kind: "applied"; slot: { pool: PoolName; slot: number; gen: number } | null } // slot: the slot lease it took
  | { kind: "stale-generation" }
  | { kind: "lease-held" }
  | { kind: "no-free-slot" };

interface WorkerKind {
  start(request: SpawnRequest): Promise<StartOutcome>;
  reconcile(attempt: AttemptRow): Promise<SessionReading>;
}

type StartOutcome =
  | { kind: "started"; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: "refused"; reason: string } // atc answered no; nothing runs
  | { kind: "unknown"; reason: string }; // no answer; the attempt goes to reconciling

type SessionReading =
  | { kind: "running"; atcSession: AtcSessionId; agentSession: AgentSessionId | null }
  | { kind: "ended"; atcSession: AtcSessionId; endedAt: Instant }
  | { kind: "absent" }; // no session with the attempt's name in atc's session list

interface FactSink {
  append(facts: OutboxFact[]): Promise<"accepted" | { kind: "unknown"; reason: string }>;
}

interface Forge {
  readPullRequest(ref: PullRequestRef): Promise<PullRequestReading | "not-found">;
  listOpenPullRequests(repo: RepoName): Promise<PullRequestRef[]>;
}

type PullRequestReading = {
  state: "open" | "closed" | "merged";
  mergedAt: Instant | null;
  mergeCommit: CommitSha | null;
  commits: { sha: CommitSha; message: string }[];
};
```

### One write path

Every write of boxxy state goes through one `StoreChange`, applied in one transaction. A module
builds the change as a pure function of the command and the rows it read. `applyChange` writes every
row and every outbox fact in the change, or none of them. A claim's `StoreChange` carries the
item-phase lease and the slot lease with the attempt row.

When `applyChange` refuses a change, it writes nothing and returns one of these:

- `stale-generation` when `under` holds a lease that is released, or a generation that isn't the
  live one;
- `lease-held` when the partial unique index on `leases` refuses a new item-phase lease;
- `no-free-slot` when the change takes a slot lease and the pool has no free slot.

These writes are bookkeeping, not state. Each changes no row that derived state or `decide()` reads,
writes outside `StoreChange`, writes no fact, and leaves the store version where it is:

- `markFactsSent`, by the outbox sender, sets `sent_at` on outbox rows that pepys accepted;
- `writeHeartbeat`, by the runner, sets the runner's `heartbeat_at`;
- `markPullRequestChecked`, by the PR watch, sets a PR's `checked_at`.

### The atc adapter

- `start` calls atc's `session.spawn` with the stored spawn request, `idempotencyKey` set to the
  attempt id, and `name` set to `boxxy/<attempt_id>`.
- `reconcile` reads atc's session list and finds the session by that name. It never treats an
  unknown idempotency key as proof that a spawn never ran, because atc deletes completed keys after
  24 hours.
- A session in state `done` or `exited` has ended. A session in `running` or `needs_you` is running.
- The import zones rule pins the atc client to this package.

### The GitHub adapter

- `readPullRequest` reads one PR and its commits over the GitHub REST API, with a token from the
  server's configuration.
- `listOpenPullRequests` lists a repo's open PRs over the same API.
- The import zones rule pins GitHub calls to this package.

### The pepys adapter

- `append` sends a batch of facts to pepys's fact-append route
  ([P2](#p2-a-fact-append-route-for-boxxy)).
- `createCostReader(config)` calls pepys's `boxxy.costToLand` query for the `boxxy cost` command.

## The store schema

The store is one SQLite file in WAL mode, with `synchronous=NORMAL`. Migrations run through Kysely's
`Migrator` with an in-code provider, as atc does. Only `adapters/store-sqlite` imports `bun:sqlite`
and `kysely`.

The store holds no item state column. `@boxxy/model` derives each item's state from its rows each
time it reads them ([derived item state](#derived-item-state)).

### `items`

The primary key is `id`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `id` | the item id | no |
| `kind` | the item kind, `core.issue` | no |
| `repo` | the repo, such as `zgeoff/pepys` | no |
| `title` | the title | no |
| `outcome` | what the item must achieve | no |
| `acceptance` | the acceptance criteria, as a JSON list of `{ id, text, evidence }` | no |
| `found_in_attempt` | the attempt whose close-out filed the item | yes |
| `filed_by` | the actor that filed the item | no |
| `filed_at` | when the item was filed | no |
| `closed_at` | when `item.close` archived the item | yes |
| `close_reason` | the reason given to `item.close` | yes |

### `links`

The primary key is `(source, target, type, added_at)`. A partial unique index on
`(source, target, type) WHERE removed_at IS NULL` allows one live link of each type between two
items.

| Column | Holds | Nullable |
| --- | --- | --- |
| `source` | the blocking item | no |
| `target` | the blocked item | no |
| `type` | the link type, `blocks` | no |
| `added_by` | the actor that added the link | no |
| `added_at` | when the link was added | no |
| `removed_at` | when `link.remove` removed the link | yes |

### `levers`

The primary key is `seq`, which autoincrements. An index covers `(item, kind)`. A lever's `kind` is
one of `plan.defer`, `plan.undefer`, `plan.expedite`, `plan.unexpedite` and `item.retry`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `seq` | the lever's order | no |
| `kind` | the lever kind | no |
| `item` | the item | no |
| `until` | when a defer ends | yes |
| `expires_at` | when an expedite ends | yes |
| `reason` | the reason the actor gave | no |
| `actor` | who wrote the lever | no |
| `at` | when the lever was written | no |

### `attempts`

The primary key is `id`. `(item, phase, number)` is unique, and an index covers `atc_session`. An
attempt's `state` is one of `starting`, `running`, `reconciling`, `succeeded` and `failed`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `id` | the attempt id | no |
| `item` | the item | no |
| `phase` | the phase, `build` | no |
| `number` | the attempt's count on this item phase, from 1 | no |
| `runner` | the runner that claimed it | no |
| `recipe_hash` | the recipe's content hash | no |
| `rules_version` | the rules version that decided the claim | no |
| `pool` | the pool | no |
| `slot` | the slot number of the attempt's slot lease | no |
| `lease_gen` | the generation of the attempt's item-phase lease | no |
| `spawn_request` | the exact spawn request, as JSON | no |
| `spawn_request_hash` | the spawn request's content hash | no |
| `state` | the attempt state | no |
| `failure` | the failure reason | yes |
| `atc_session` | atc's session id | yes |
| `agent_session` | the agent CLI's own session id | yes |
| `close_out` | the latest valid close-out, as JSON | yes |
| `claimed_at` | when the claim committed | no |
| `started_at` | when atc started the session | yes |
| `ended_at` | when the attempt settled | yes |

### `leases`

Each row is one item-phase lease. The primary key is `(item, phase, gen)`. A partial unique
index on `(item, phase) WHERE released_at IS NULL` allows one live item-phase lease per item phase.

| Column | Holds | Nullable |
| --- | --- | --- |
| `item` | the item | no |
| `phase` | the phase | no |
| `attempt` | the attempt that holds the lease | no |
| `gen` | the lease generation | no |
| `taken_at` | when the claim took the lease | no |
| `released_at` | when settle released the lease | yes |

### `pool_slots`

Each row is one slot in a pool, and its `holder` column is the slot lease. The primary key is `(pool, slot)`. A take is the
guarded update
`UPDATE … SET holder = ?, gen = gen + 1 WHERE pool = ? AND slot = ? AND holder IS NULL AND retired = 0`,
which must change one row.

| Column | Holds | Nullable |
| --- | --- | --- |
| `pool` | the pool | no |
| `slot` | the slot number | no |
| `holder` | the slot lease: the attempt that holds the slot | yes |
| `gen` | the slot's generation, one higher on each take | no |
| `retired` | 1 when the slot is above the pool's slot count | no |

### `decisions`

The primary key is `id`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `id` | the decision id | no |
| `attempt` | the attempt the decision claimed | no |
| `item` | the item | no |
| `pool` | the pool | no |
| `rules_version` | the rules version | no |
| `snapshot_hash` | the content hash of the snapshot `decide()` read | no |
| `store_version` | the store version the snapshot read | no |
| `pepys_offsets` | the offset read in each pepys stream, as JSON | no |
| `faults` | the plug-in faults, as JSON | no |
| `at` | when the decision was made | no |

### `evidence`

The primary key is `fact_id`. `(attempt, kind, ref)` is unique. An evidence row's `kind` is one of
`pr`, `commit`, `test`, `ci-run` and `live-check`, and its `source` is one of `hook`, `trailer` and
`agent`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `fact_id` | the id of the evidence fact | no |
| `attempt` | the attempt | no |
| `kind` | the evidence kind | no |
| `ref` | what the evidence points at, as JSON | no |
| `observed` | what the agent saw, from `--observed` | yes |
| `source` | how boxxy learned of the evidence | no |
| `at` | when the evidence was recorded | no |

### `pull_requests`

The primary key is `(repo, number)`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `repo` | the repo | no |
| `number` | the PR number | no |
| `attempt` | the attempt that opened the PR | no |
| `state` | `open`, `closed` or `merged` | no |
| `merged_at` | when the PR merged | yes |
| `merge_commit` | the merge commit | yes |
| `checked_at` | when the PR watch last read the PR | no |

### `runners`

The primary key is `id`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `id` | the runner id | no |
| `heartbeat_at` | the runner's last heartbeat | no |
| `paused` | 1 when `runner.pause` stopped new claims | no |

### `outbox`

The primary key is `seq`, which autoincrements. `fact_id` is unique, and a partial index covers
`seq WHERE sent_at IS NULL`.

| Column | Holds | Nullable |
| --- | --- | --- |
| `seq` | the row's order, and the store version it made | no |
| `fact_id` | the fact id | no |
| `type` | the fact type | no |
| `entity` | the fact's entity | no |
| `actor` | the fact's actor | no |
| `at` | when the change was applied | no |
| `payload` | the fact payload, as JSON | no |
| `sent_at` | when pepys accepted the fact | yes |

### Store rules

- **The store version** is the highest `outbox.seq`. Every change writes at least one outbox row in
  the same transaction as the change, so the store version moves with every change.
- **The partial unique index on `leases`** allows one live item-phase lease per item phase. The
  guarded update on `pool_slots` allows one holder per slot. A claim takes the item-phase
  lease and the slot lease in one `StoreChange`.
- **A new item-phase lease's `gen`** is one more than the highest `gen` for that item phase. The
  attempt stores it as `lease_gen`. Every change about the attempt after the claim, such as a
  start, a close-out or a settle, puts that generation in `under`.
- **Pool slots follow the rules.** When the server loads a rules version, the store adds slot rows
  up to the pool's `slots` count, and marks rows above the count `retired`. A retired slot keeps its
  holder until that attempt settles.
- **`pepys_offsets`** is `{}` in every slice 1 decision, because `decide()` reads nothing from pepys
  yet. The column exists so `explain` can read the observation boundary
  ([dispatch](./dispatch.md#the-observation-boundary)) when a later concept reads pepys facts.
- **S1-06's benchmark script measures `claimNext` on this store.** It must report a lock p99 under
  50 ms at 5,000 open items ([dispatch](./dispatch.md#the-benchmark-measured) gives the reference
  figures).

### Derived item state

`deriveItemState(item, rows, now)` in `@boxxy/model` returns the first state in this table whose
condition holds:

| State | When | Reason |
| --- | --- | --- |
| `archived` | `closed_at` is set | |
| `done` | a PR linked to one of the item's succeeded attempts is merged | |
| `running` | the item holds a live item-phase lease | |
| `waiting` | an attempt succeeded and its PR is open | PR open |
| `waiting` | an attempt succeeded and no PR is linked to it | no PR linked |
| `waiting` | the failed attempts reached the kind's `maxAttempts` | attempts used up |
| `idea` | the acceptance list is empty | |
| `blocked` | the item is the target of a live `blocks` link whose source is not `done` or `archived` | |
| `ready` | none of the above | |

- The `waiting` rows count only attempts that ended after the item's latest `item.retry` lever. So
  `boxxy item retry` returns a `waiting` item to `ready`.
- A succeeded attempt whose PR closes unmerged no longer counts, so the item returns to `ready`.
- When the PR watch finds the PR of an attempt in "no PR linked", it links the PR
  ([links](#links-to-commits-and-prs)), and the item waits on "PR open".

## Rules for slice 1

Rules live in a git repo, and the server reads them from a checkout whose path is in its
configuration ([rules](./rules.md)). The server refuses a checkout with uncommitted changes. One
file, `rules.yaml`, holds slice 1's policy, and the recipe's prompt template sits beside it:

```yaml
# rules.yaml
version: 1

concepts: # name@version; the loader pins each to its content hash
  - pool@1
  - defer@1
  - expedite@1

kinds:
  core.issue:
    pipeline: [build]
    maxAttempts: { build: 2 }
    recipes: { build: build-v1 }

pools:
  - name: pepys-build
    slots: 2
    takes: { phase: build, kind: [core.issue], repo: [zgeoff/pepys] }
    order: [oldest]
    when_empty: idle

lead: [expedite] # signals every pool sorts by before its own order

propagation:
  - value: expedite
    over: blocks
    toward: source # an expedited blocked item pulls its blockers forward

recipes:
  build-v1:
    agent: claude
    model: <model id>
    effort: high
    prompt: prompts/build-v1.md
    source: subscription # the capacity source name; slice 1 has no router
```

- **The loader rejects** an unknown concept name, a concept parameter that fails the concept's
  schema, a pool whose `order` or `lead` lists a signal no concept registers, a propagation line over
  an unknown link type or for a signal with no `combine`, a kind with no recipe for a pipeline phase,
  and a missing prompt file. The loader reports each rejection with the file, the path in the file
  and the reason.
- **The rules version** is the content hash of the checkout's commit hash, the bytes of every file
  the loader read, and each concept pin. A pin is `name@version` with the SHA-256 of the concept
  module's source, which `@boxxy/rules` computes when it loads the concept.
- **The recipe hash** is the content hash of the recipe's fields, the prompt template's bytes, the
  hash of the Claude Code plugin folder, and the rules version. The slice 1 recipe hash leaves out
  skills and the repo's instruction files.
- **The prompt template** gets these values: the item's title, outcome and acceptance list with each
  criterion's id, the repo, the attempt id, and the commands for the trailer, evidence and close-out
  below.
- The server's own configuration, never the rules, holds machine details: the store file, the rules
  checkout, each repo's local path, the atc and pepys endpoints, and the tokens.

## Planning: buildFrame and decide

`buildFrame` and `decide` are pure functions in `@boxxy/planning`. `decide()` never refers to a concept
by name: it reads the frame and the pools ([planning](./planning.md#buildframe-and-decide)).

```ts
type Snapshot = {
  storeVersion: number;
  items: ItemView[]; // every item not yet done and not archived, with its derived state at `now`
  links: LinkRow[]; // live links
  levers: LeverRow[]; // live levers: not undone, not expired at `now`
  freeSlots: Record<PoolName, number>;
};

function buildFrame(input: { snapshot: Snapshot; rules: LoadedRules; now: Instant }): Frame;

type Frame = {
  candidates: FrameItem[]; // items in state `ready`
  values: Map<SignalKey, Map<ItemId, number>>; // after propagation; SignalKey = name + parameters
  holds: Map<ItemId, Hold[]>; // gate holds still in force after waivers
  lifted: Map<ItemId, Lift[]>; // holds a waiver lifted, with the waiver's name
  faults: Fault[]; // each plug-in call or propagation line that threw
};

function decide(input: { frame: Frame; pools: Pool[]; freeSlots: Record<PoolName, number> }): Decision;

type Decision = { picks: Pick[] }; // in pool order, then sort order
type Pick = { item: ItemId; phase: PhaseName; pool: PoolName };
```

`buildFrame` runs these steps in order:

1. Each signal that a propagation line carries, such as `expedite`, computes its value from the item
   and its levers.
2. `buildFrame` carries each propagation line's value across links. When two values meet, the
   signal's `combine` keeps one.
3. Each gate decides whether it holds the item.
4. Each waiver may lift one gate's hold, reading the propagated values.
5. Each other signal, such as `oldest`, computes its value.

`decide` walks the pools in declared order. For each pool, it takes the candidates with no hold that
match the pool's `takes` and that no earlier pool picked. It sorts them by the `lead` signals, then
the pool's `order` signals, then item id. A lower value sorts first, and an item with no value for a
signal sorts after every item with one. It picks one item per free slot.

### Plug-in kind interfaces

Slice 1 has plug-ins of three kinds: signal, gate and waiver. The registry also declares
`admission` and `view`, with no slice 1 plug-in. A propagation line is rules data, and `buildFrame`
runs it.

```ts
type PlanContext = { now: Instant; levers: LeverRow[]; links: LinkRow[]; values: FrameValues };

interface Signal {
  name: SignalName;
  params: ZodType; // checked by the loader
  value(item: FrameItem, ctx: PlanContext, params: unknown): number | null; // null: no opinion
  combine?(a: number, b: number): number; // used when a propagation line carries this signal
}

interface Gate {
  name: GateName;
  liftable: boolean;
  hold(item: FrameItem, ctx: PlanContext): Hold | null; // Hold = { gate, reason, until? }
}

interface Waiver {
  name: WaiverName;
  lifts: GateName;
  lift(item: FrameItem, hold: Hold, ctx: PlanContext): Lift | null;
}

interface Concept {
  name: ConceptName; // "pool", "defer" or "expedite"
  version: number; // rules.yaml pins the concept as name@version
  signals?: Signal[];
  gates?: Gate[];
  waivers?: Waiver[];
  levers?: LeverKind[]; // the lever kinds its commands write
}
```

A plug-in that throws is a fault. `buildFrame` records it in `faults` and fails toward holding
([dispatch](./dispatch.md#gates-fail-toward-holding)): a failed gate holds with the fault as its
reason, a failed waiver lifts nothing, and a failed signal gives no opinion. A propagation line that
throws carries nothing.

### The slice 1 concepts

Slice 1 has three concepts, and together they register four plug-ins. `rules.yaml` pins each
concept by name and version.

| Plug-in | Kind | Concept |
| --- | --- | --- |
| `oldest` | signal | `pool` |
| `defer` | gate | `defer` |
| `expedite-lifts-defer` | waiver | `defer` |
| `expedite` | signal | `expedite` |

- `oldest` gives the item's `filed_at` in milliseconds.
- `defer` holds an item with a live `plan.defer` lever until the lever's `until`. With no `until`,
  it holds the item until a later `plan.undefer`. Its hold is liftable.
- `expedite-lifts-defer` lifts a `defer` hold on any item with an `expedite` value, propagated values
  included.
- `expedite` gives the item's position among live `plan.expedite` levers, oldest first, so the first
  expedite sorts first. Its `combine` is `min`.

The `pool` concept also defines the pool filter fields `phase`, `kind` and `repo`. The `defer`
concept registers the levers `plan.defer` and `plan.undefer`. The `expedite` concept registers the
levers `plan.expedite` and `plan.unexpedite`, and its signal is the value that the `propagation`
line in the rules carries.

For each propagation line, `buildFrame` starts from every item with a value for the line's signal.
It walks the named link type in the named direction, and gives each item it reaches the value,
combined by the signal's `combine`. It stops at an item it has already visited.

A `blocked` item is never a candidate, because its derived state is `blocked`. Expedite reaches
through blockers by propagation: an expedited blocked item gives its blockers its `expedite` value,
so they run first.

## claimNext

`claimNext(input)` in `@boxxy/dispatch` claims at most one item phase. The runner calls it whenever a
slot may be free.

```ts
function claimNext(input: {
  store: ClaimStore;
  runner: RunnerId;
  rules: LoadedRules;
  now: Instant;
  newId: () => string; // attempt, decision and fact ids, from the app
}): Promise<Claim | null>;

type Claim = { attempt: AttemptId; item: ItemId; pool: PoolName; slot: number; gen: number; spawn: SpawnRequest };
```

All of these steps run inside one `store.exclusive` call, so inside one `BEGIN IMMEDIATE`
transaction:

1. Read the runner's row. When it is paused, return `null`.
2. Read the snapshot with `readSnapshot(now)`, which holds the store version.
3. Hash the snapshot with `@boxxy/content-hash`.
4. Run `buildFrame`, then `decide`. With no pick, return `null` and write nothing.
5. For the first pick, read the item phase's last lease generation with `readLastLeaseGen`.
6. Build the spawn request from the recipe: cwd from the repo's configured path, the prompt from the
   template, the agent, model and effort, the plugin folder, the name `boxxy/<attempt_id>`, the
   idempotency key, and the telemetry attributes in [the OTel stamp](#the-otel-stamp).
7. Apply one `StoreChange` that holds the item-phase lease at the next generation, the slot lease in
   the pick's pool, the attempt row in state `starting`, the decision row, and the outbox facts
   `boxxy.attempt.claimed` and `boxxy.decision.recorded`. `applyChange` takes the lowest free slot
   and writes its number into the attempt row and the `boxxy.attempt.claimed` payload. When
   `applyChange` returns `lease-held` or `no-free-slot`, throw, so the transaction rolls back.
8. Commit, and return the claim.

The runner starts the attempt after the commit, outside the lock:

- `started`: apply a change under the claim's generation that moves the attempt to `running` with
  the session ids, and writes `boxxy.attempt.started`.
- `refused`: settle the attempt as `failed` with reason `spawn-refused`, which releases the
  item-phase lease and the slot lease.
- `unknown`: apply a change under the claim's generation that moves the attempt to `reconciling`,
  and writes `boxxy.attempt.reconciling`.

## The runner loop

The server runs one runner. Each tick, every 5 seconds by default:

1. Write the runner's heartbeat with `writeHeartbeat`.
2. Call `claimNext` until it returns `null`, and start each claim.
3. Reconcile each attempt in `starting`, `running` or `reconciling` through `WorkerKind.reconcile`,
   and act on the reading by the table below.
4. Run the outbox sender ([facts and the outbox](#facts-and-the-outbox)).
5. Every 5 minutes, run the PR watch ([links](#links-to-commits-and-prs)).

Each change below runs under the attempt's generation.

| Reading | Attempt state | Action |
| --- | --- | --- |
| `running` | `starting` | move the attempt to `running` with the session ids, and write `boxxy.attempt.started` |
| `running` | `reconciling` | move the attempt to `running` with the session ids, and write `boxxy.attempt.reconciled` |
| `running` | `running` | record session ids that are new, and write `boxxy.attempt.session_seen` |
| `ended` | any | settle the attempt |
| `absent` | `starting` | settle the attempt as `failed` with reason `session-lost` |
| `absent` | `running` | settle the attempt as `failed` with reason `session-lost` |
| `absent` | `reconciling` | send the stored spawn request again, with the same idempotency key |

When atc still shows no session for a `reconciling` attempt 10 minutes after the claim, settle the
attempt as `failed` with reason `spawn-lost`. Every settle releases the item-phase lease and the
slot lease.

When the server starts, it reconciles every attempt in `starting`, `running` or `reconciling` before
its first claim.

Settle applies one `StoreChange` under the attempt's generation. Build the change with these steps:

1. Set the attempt's state from its latest valid close-out. `built` gives `succeeded`. `blocked` or
   `abandoned` gives `failed`, with the close-out's reason. When the close-out is missing or doesn't
   parse, settle the attempt as `failed` with reason `closeout-missing`.
2. Release the item-phase lease and the slot lease.
3. File each entry in the latest valid close-out's `openItems` through dedupe, and record each
   friction entry, whatever the close-out's result.
4. Write `boxxy.attempt.settled`, and the facts for step 3.

## The build close-out

The agent sends its close-out with `boxxy attempt close-out` before its session ends. The type
follows [close-outs](./close-outs.md#the-build-close-out). Slice 1 fixes the parts that doc leaves
proposed.

```ts
type BuildCloseOut = {
  result: { kind: "built" } | { kind: "blocked"; reason: string } | { kind: "abandoned"; reason: string };
  criteria: { criterion: CriterionId; evidence: FactId }[];
  openItems: { kind: "core.issue"; title: string; body: string }[];
  friction: {
    target: { kind: "skill" | "rule" | "lint" | "agents-md" | "tool"; name: string };
    change: string;
  }[];
};
```

- **Evidence ids** are the `fact_id`s of the attempt's `evidence` rows. The PR hook and the PR watch
  write PR and commit evidence. The agent writes test, CI run and live check evidence with
  `boxxy attempt evidence`, which prints the new fact id.
- **The parser rejects** a close-out that fails the schema, cites a criterion the item lacks, cites
  an evidence id that belongs to another attempt, or has result `built` while a criterion has no
  evidence. The parser returns every problem at once, and the CLI prints them all, so the agent can
  fix the close-out and send it again.
- **The latest valid close-out wins.** Each valid one writes `boxxy.attempt.closed_out`.
- **Dedupe matches an `openItems` entry** to a `core.issue` not yet done in the same repo whose
  title is equal after lowercasing and collapsing spaces. A match files nothing. With no match,
  settle files a new item with an empty acceptance list, so it starts as an `idea`, with
  `found_in_attempt` set.
- **Friction** becomes a `boxxy.proposal.recorded` fact. Slice 1 acts on it no further.

## Links to commits and PRs

[Decision 0012](../../decisions/0012-link-attempts-by-trailer-and-hook.md) sets how attempts link to
commits and PRs. Slice 1 builds the links with a Claude Code plugin that atc loads into each boxxy
session through `pluginDirs`, and with the PR watch in the server. The plugin lives in
`apps/cli/plugin/` and runs two hook commands. Each hook command finds its attempt by calling
`attempt.current` with the `ATC_SESSION_ID` from its environment. atc sets that variable in every
session it starts.

- **The trailer is `Boxxy-Attempt: <attempt_id>`.** The prompt tells the agent to commit with
  `git commit --trailer "Boxxy-Attempt: <attempt_id>"`. The `PreToolUse` hook,
  `boxxy hook pre-tool-use`, denies a Bash `git commit` call that passes `-m` or `--message` without
  that trailer, and puts the exact flag to add in its deny reason. The hook allows every other call.
  It also allows the commit when the API is down or the session holds no attempt.
- **When the agent opens a PR, the `PostToolUse` hook links it.** The hook,
  `boxxy hook post-tool-use`, matches a Bash call whose command runs `gh pr create`. It reads the PR
  URL from the command's output and calls `evidence.recordPr`. The server writes a `pr` evidence
  row, adds the PR to `pull_requests`, and writes `boxxy.evidence.pr_linked`.
- **Every 5 minutes, the PR watch reads each open PR** in `pull_requests`, and sets its
  `checked_at` with `markPullRequestChecked`. For each commit in the PR
  whose `Boxxy-Attempt` trailer carries the id of an attempt of the same item, the watch writes a `commit`
  evidence row and `boxxy.evidence.commit_linked`, once per commit. When the PR has merged, the
  watch writes `boxxy.pr.merged`. When the PR has closed without a merge, it writes
  `boxxy.pr.closed`.
- **The PR watch also links each PR the hook missed.** For each attempt that succeeded with no PR
  linked, the watch lists the repo's open PRs. It links the first PR with a commit whose trailer
  carries that attempt's id, with the same rows and fact as `evidence.recordPr`.
- Both hooks exit 0, print nothing on failure, and give up after 5 seconds.

## The OTel stamp

`worker-atc` sets `OTEL_RESOURCE_ATTRIBUTES` on each session it starts, so every request record the
agent sends carries the attempt beside its `model` ([measurement](./measurement.md#spend-capture)).
The stamp is the only join from a request record to its attempt. A record with no `boxxy.attempt`
attribute belongs to no attempt.

The value is a comma-separated list of `key=value` pairs, with each value percent-encoded:

| Key | Value |
| --- | --- |
| `boxxy.item` | the item id |
| `boxxy.phase` | `build` |
| `boxxy.attempt` | the attempt id |
| `boxxy.recipe` | the recipe hash |
| `boxxy.source` | the recipe's capacity source name |

`worker-atc` needs atc to pass the stamp to the agent process
([A1](#a1-telemetry-attributes-on-spawn)).

## Facts and the outbox

Every state change in the store writes its facts to the outbox in the same transaction as the change
([decision 0013](../../decisions/0013-one-write-path-per-fact.md)). The outbox sender in the server
sends unsent rows in `seq` order, in batches of up to 100, through `FactSink`. Before it sends a row,
it adds the row's `seq` to the payload as `storeVersion`.

- On `accepted`, the outbox sender marks the rows sent with `markFactsSent`, outside `StoreChange`
  ([one write path](#one-write-path)). It writes no fact.
- On `unknown`, the outbox sender sends the same rows again on the next tick.

A pepys outage grows only the outbox. Claims and attempts go on, and `boxxy status` shows the oldest
unsent fact's age.

Each fact uses pepys's envelope
([pepys log design](https://github.com/zgeoff/pepys/blob/main/docs/design/pepys/log.md#the-fact-envelope)),
on one stream, `facts.boxxy.work`:

| Envelope field | Value |
| --- | --- |
| `id` | the outbox row's `fact_id`: a UUIDv7 made when the row is written |
| `type` | the fact type, from the table below |
| `v` | `1` |
| `api` | `boxxy/1` |
| `entity` | the entity for the fact type, from the table below |
| `actor` | `owner`, `runner:<runner_id>`, `attempt:<attempt_id>` or `hook` |
| `at` | the time the change was applied |
| `payload` | the change, typed per fact type in `@boxxy/model`, with `storeVersion` |

pepys drops a fact whose id it has already applied, with no error. A resend carries the row's own
`fact_id`, so pepys drops the copy. Two distinct changes always get two rows, so they never share an
id.

| Type | Entity | Written by | Payload |
| --- | --- | --- | --- |
| `boxxy.item.filed` | `boxxy:item:<item_id>` | `item.file` | the item row |
| `boxxy.item.filed` | `boxxy:item:<item_id>` | settle, for `openItems` | the item row |
| `boxxy.item.edited` | `boxxy:item:<item_id>` | `item.edit` | the changed fields |
| `boxxy.item.closed` | `boxxy:item:<item_id>` | `item.close` | the reason |
| `boxxy.link.added` | `boxxy:link:<source_id>:<type>:<target_id>` | `link.add` | source, target and type |
| `boxxy.link.removed` | `boxxy:link:<source_id>:<type>:<target_id>` | `link.remove` | source, target and type |
| `boxxy.lever.recorded` | `boxxy:item:<item_id>` | `plan.*` and `item.retry` | the lever row |
| `boxxy.attempt.claimed` | `boxxy:attempt:<attempt_id>` | `claimNext` | item, phase, number, pool, slot, gen, recipe hash and rules version |
| `boxxy.decision.recorded` | `boxxy:decision:<decision_id>` | `claimNext` | the decision row |
| `boxxy.attempt.started` | `boxxy:attempt:<attempt_id>` | the runner, on a `started` start or reconcile | atc session id and agent session id |
| `boxxy.attempt.reconciling` | `boxxy:attempt:<attempt_id>` | the runner, on an `unknown` start | the reason |
| `boxxy.attempt.reconciled` | `boxxy:attempt:<attempt_id>` | reconcile | atc session id and agent session id |
| `boxxy.attempt.session_seen` | `boxxy:attempt:<attempt_id>` | reconcile | atc session id and agent session id, when first known after start |
| `boxxy.attempt.closed_out` | `boxxy:attempt:<attempt_id>` | `attempt.closeOut` | the close-out |
| `boxxy.attempt.settled` | `boxxy:attempt:<attempt_id>` | settle | state, failure reason and end time |
| `boxxy.evidence.recorded` | `boxxy:attempt:<attempt_id>` | `attempt.evidence` | kind, ref and observed |
| `boxxy.evidence.pr_linked` | `boxxy:attempt:<attempt_id>` | `evidence.recordPr` and the PR watch | repo, number and URL |
| `boxxy.evidence.commit_linked` | `boxxy:attempt:<attempt_id>` | the PR watch | repo, sha and PR number |
| `boxxy.pr.merged` | `boxxy:attempt:<attempt_id>` | the PR watch | repo, number, merge time and merge commit |
| `boxxy.pr.closed` | `boxxy:attempt:<attempt_id>` | the PR watch | repo and number |
| `boxxy.proposal.recorded` | `boxxy:attempt:<attempt_id>` | settle, for friction | target and change |
| `boxxy.runner.paused` | `boxxy:runner:<runner_id>` | `runner.pause` | runner id |
| `boxxy.runner.resumed` | `boxxy:runner:<runner_id>` | `runner.resume` | runner id |

## The pepys consumer and the query

The consumer and the query are pepys deployment code, in the pepys repo. A pepys consumer compiles
with pepys's toolchain and gets its row types from pepys's consumer declarations, and the query runs
on pepys's Kysely dialect, so neither builds in boxxy's workspace. boxxy owns the fact catalog in
`@boxxy/model`, and the consumer re-declares the payload types it reads.

**The consumer, `boxxy-work`,** runs in fact mode on `facts.boxxy.work`. It owns these tables:

- `boxxy_items`, keyed by `id`, with the kind, repo, title, filed time and closed time.
- `boxxy_attempts`, keyed by `id`, with the item, phase, number, pool, recipe hash, rules version,
  state, failure, atc session, agent session, claimed time, started time and ended time.
- `boxxy_pull_requests`, keyed by `(repo, number)`, with the attempt, item, linked time, merged time
  and merge commit.

Each fact updates one row. Each row also stores the `storeVersion` of the last fact applied to it,
and a fact with a lower `storeVersion` leaves the row as it is. The rows come out the same in any
order the facts arrive.

**The query, `boxxy.costToLand`,** is registered in pepys's deployment catalog. It attaches the
`boxxy-work` file and the file of pepys's OTel consumer ([P1](#p1-claude-code-telemetry-as-facts))
read-only, as pepys's
[store design](https://github.com/zgeoff/pepys/blob/main/docs/design/pepys/store.md#reading-files)
allows for a query across consumer files.

- Input: `{ repo?: string; landedFrom?: string; landedTo?: string }`, with dates as ISO 8601.
- An item has landed when one of its PRs has `merged_at` set. Its landing time is the earliest such
  `merged_at`.
- Its cost is every `claude_code.api_request` record of every attempt of that item, failed and
  abandoned attempts included. A record belongs to an attempt when its `boxxy.attempt` resource
  attribute holds the attempt's id.
- Output: one row per landed item and model: item id, title, repo, landed at, model, attempts,
  requests, input tokens, output tokens, cache read tokens, cache creation tokens, total input
  tokens, and cost in USD.
- Total input is `input_tokens + cache_read_tokens + cache_creation_tokens`.
- Cost is the sum of Claude Code's `cost_usd`, a list-price figure the agent computes. It is
  modelled, not billed. Register the query with a description that marks the cost as modelled.

## Commands and API

The server serves one oRPC router on Elysia, on `127.0.0.1` only, under `/rpc`. `@boxxy/contract`
holds its contract, and the CLI calls it through an oRPC client. In slice 1 the API checks no
caller identity. The actor recorded on a fact is `owner` for CLI commands, and `attempt:<id>` or
`hook` for the attempt and hook procedures.

| Procedure | CLI command | Does |
| --- | --- | --- |
| `item.file` | `boxxy item file --repo <repo> --title <text> --outcome <text> [--acceptance <text>]… [--blocked-by <item_id>]…` | files a `core.issue`, and returns its id |
| `item.edit` | `boxxy item edit <item_id> [--title] [--outcome] [--acceptance <text>]…` | replaces the given fields |
| `item.get` | `boxxy item show <item_id>` | returns the item, its derived state, attempts, links, evidence and PRs |
| `item.list` | `boxxy item list [--state <state>] [--repo <repo>]` | returns items with their derived state |
| `item.close` | `boxxy item close <item_id> --reason <text>` | archives the item |
| `item.retry` | `boxxy item retry <item_id>` | writes an `item.retry` lever, which returns a `waiting` item to `ready` |
| `link.add` | `boxxy link add <source_id> blocks <target_id>` | adds a `blocks` link |
| `link.remove` | `boxxy link remove <source_id> blocks <target_id>` | removes a `blocks` link |
| `plan.defer` | `boxxy defer <item_id> [--until <time>] --reason <text>` | writes a `plan.defer` lever |
| `plan.undefer` | `boxxy undefer <item_id>` | writes a `plan.undefer` lever |
| `plan.expedite` | `boxxy expedite <item_id>… --reason <text> [--expires <time>]` | writes one `plan.expedite` lever per item, in the order given |
| `plan.unexpedite` | `boxxy unexpedite <item_id>` | writes a `plan.unexpedite` lever |
| `runner.status` | `boxxy status` | returns pools and slots, running attempts, the paused flag and the outbox lag |
| `runner.pause` | `boxxy runner pause` | stops new claims |
| `runner.resume` | `boxxy runner resume` | restarts new claims |
| `attempt.current` | `boxxy attempt current` | returns the attempt for `ATC_SESSION_ID`, with its item and acceptance |
| `attempt.evidence` | `boxxy attempt evidence --kind <kind> --ref <ref> [--observed <text>]` | records evidence, and prints its fact id |
| `attempt.closeOut` | `boxxy attempt close-out` (JSON on stdin) | parses and records the close-out, and prints every problem on failure |
| `evidence.recordPr` | `boxxy hook post-tool-use` (hook payload on stdin) | links a PR to the session's attempt |
| none | `boxxy hook pre-tool-use` (hook payload on stdin) | checks the trailer on `git commit` |
| none | `boxxy cost [--repo <repo>] [--since <date>] [--until <date>]` | prints pepys's `boxxy.costToLand` rows |

- `boxxy attempt evidence` takes `--kind` as `test`, `ci-run` or `live-check`. `--ref` is what the
  agent checked: a test file and test name, a CI run URL, or the URL or command of a live check.
  `--observed` holds what the agent saw, such as `42 passed` or an HTTP status, and goes into the
  evidence row's `observed` column.
- `boxxy cost` passes `--repo` as the query's `repo`, `--since` as `landedFrom`, and `--until` as
  `landedTo`. Each date is ISO 8601.
- The `attempt.*` procedures find the attempt by `ATC_SESSION_ID` and write under its live
  generation, so the store refuses a call from a session whose attempt has settled.

### How an item gets in

An item gets in through `item.file`, from the CLI or from any oRPC client. The input needs a repo, a
title and an outcome; the acceptance list may be empty. An item with acceptance starts `ready`, or
`blocked` when `--blocked-by` lists an item not yet done. An item with no acceptance starts as an
`idea`, and `item.edit` with acceptance makes it `ready`. Settle files the other items, from a
close-out's `openItems`.

## Prerequisites outside boxxy

Slice 1 needs these changes in other repos. The units in [build order](#build-order) name the ones
they depend on. H1 blocks S1-01, and every other unit depends on S1-01, so H1 blocks every unit.

### pepys

#### P1: Claude Code telemetry as facts

boxxy needs pepys to ingest Claude Code's OpenTelemetry log records as facts. pepys's OTel consumer
projects each `claude_code.api_request` record into a table with the model, `cost_usd`, the token
counts, the `session.id`, the time, and every resource attribute whose key starts with `boxxy.`.

Each fact id is the event name, joined with one of these:

- the `request_id`, for an event that has one;
- the `tool_use_id`, for a tool result;
- the session id and the event sequence, for an event with neither.

pepys drops a repeated fact id with no error, so two distinct events must never share one. A test
delivers the same record twice and keeps one. It also delivers a `claude_code.api_request` and a
`claude_code.api_error` that share a `request_id`, and keeps both.

#### P2: A fact-append route for boxxy

boxxy needs a pepys route that appends a batch of facts to `facts.boxxy.work`, with the fact ids
boxxy made. The route refuses streams other than `facts.boxxy.*`, needs a client with write scope,
and answers only once the batch is durable in the log.

#### P3: Deployment queries and the boxxy consumer

boxxy needs pepys's `createRouter` to accept a deployment's queries, and the deployment to register
the `boxxy-work` consumer and the `boxxy.costToLand` query.

#### P4: pepys running live

boxxy needs pepys running live, with its log, host and API, and reachable from the machine boxxy
runs on.

### atc

#### A1: Telemetry attributes on spawn

boxxy needs `session.spawn` to accept telemetry resource attributes, or environment variables, for
each session, and to pass them to the agent process as `OTEL_RESOURCE_ATTRIBUTES`. S1-09 depends on
A1.

### hq

#### H1: A boxxy area in hq

boxxy needs hq to know the `boxxy` area and its repo, `zgeoff/boxxy`. hq picks the repo for a task
from the task's area, and hq's build flow dispatches the units below.

## Build order

Each unit is one PR or a short stack. "Depends on" lists units and prerequisites by id.

### S1-01: Repo setup

- **Delivers:** the workspace, toolchain, CI, release and sync, copied from wringer as
  [tech stack](./tech-stack.md) lists:
  - Files:
    - the root `package.json`, with the catalog and the four workspace folders, `apps/`,
      `modules/`, `adapters/` and `libs/`, with `test-utils/` and `e2e/` beside them;
    - `bunfig.toml` and the tsconfig;
    - the turbo boundaries config;
    - the oxlint config, with the import zones pins;
    - the oxfmt, lefthook, commitlint and knip configs;
    - the PR template, `CLAUDE.md` and the root README;
    - the release-please config, with one component per package.
  - Workflows:
    - `pr.yml`, with the checks, through repo-sync;
    - `main.yml`;
    - `npm-packages.yml`, which publishes every workspace package as `@boxxy/<folder>` through npm
      trusted publishing.
  - Repo settings:
    - a ruleset on `main`.
- **Owner steps:** create the `@boxxy` npm scope; run `scripts/first-publish.sh <package>` once per
  package; add the trusted publisher on npmjs.com; install the repo-sync App and set its secrets;
  allow auto-merge.
- **Depends on:** H1.
- **Acceptance:**
  - A PR's `pr / checks` run is green with a placeholder package in each of the four folders (CI
    run).
  - A placeholder module that imports an adapter fails `turbo boundaries`, and a module that imports
    `bun:sqlite` fails oxlint (CI run on a throwaway PR, linked in the setup PR).
  - The ruleset on `main` requires `pr / checks` and blocks a direct push (live check:
    `gh api repos/zgeoff/boxxy/rulesets`).
  - repo-sync opens and merges a sync PR (the PR link).
  - `npm-packages.yml` packs every placeholder package and dry-runs its publish (CI run).
  - `bun x lefthook run pre-push` runs lint, the format check, type checks, tests and
    `turbo boundaries`, and fails when one of them fails (command output in the PR).
  - The root README describes the workspace and its packages (the diff).

### S1-02: Model, content hash and fact catalog

- **Delivers:**
  - `@boxxy/model`, with:
    - the branded ids;
    - the item, link, lever, attempt and evidence types;
    - `deriveItemState`;
    - the fact catalog, with a zod schema per fact type;
    - `StoreChange`.
  - `@boxxy/content-hash`, with:
    - canonical JSON;
    - SHA-256 hex hashes.
- **Depends on:** S1-01.
- **Acceptance:**
  - `derive-item-state.test.ts` covers each row of the derived state table, in its order, and an
    `item.retry` lever that returns a `waiting` item to `ready` (test).
  - The same value with its object keys in another order hashes the same, and a changed value hashes
    differently (`content-hash.test.ts`).
  - Each fact type's schema accepts its example payload and rejects one with a missing field (test).

### S1-03: Rules loader and registry

- **Delivers:** `@boxxy/rules`: the `rules.yaml` schema, the loader, the plug-in kind registry with
  pinned content hashes, and the rules version.
- **Depends on:** S1-02.
- **Acceptance:**
  - The [example rules file](#rules-for-slice-1) loads (test).
  - Each rejection in the list under the example returns an error with the file, the path and the
    reason (one test per rejection).
  - The rules version changes when one byte of the prompt template changes, and when a concept's
    pinned hash changes (test).

### S1-04: Planning

- **Delivers:** `@boxxy/planning`: `buildFrame` with its propagation step, `decide`, and the concepts
  `pool@1`, `defer@1` and `expedite@1`.
- **Depends on:** S1-03.
- **Acceptance:**
  - A deferred item is held; an expedited deferred item is picked; a deferred item expires and is
    picked after its `until` (tests).
  - An expedited blocked item gives its blocker the `expedite` value, and the blocker is picked first
    (test).
  - A gate that throws holds its item with the fault as its reason, a waiver that throws lifts
    nothing, a signal that throws gives no opinion, and a propagation line that throws carries
    nothing (one test each).
  - `decide` returns the same picks for the same frame across 100 runs under `--randomize` (test).
  - `decide.ts` never imports a file under `src/concepts/` (lint or test).

### S1-05: The store

- **Delivers:** `@boxxy/store-sqlite` (schema, migrations, `ClaimStore`), the `ClaimStore` port and
  its memory fake in `@boxxy/dispatch`, and the port's contract test suite.
- **Depends on:** S1-02.
- **Acceptance:**
  - The contract suite passes against the fake and against SQLite in a temporary file (test).
  - The partial unique index refuses a second live item-phase lease on one item phase, and
    `applyChange` returns `lease-held` (test).
  - A slot lease take on a held slot changes no row, and `applyChange` returns `no-free-slot` (test).
  - The store refuses a change under a stale generation whole: it writes no row and no outbox fact
    (test).
  - Migrations run on an empty file and again on a migrated file with no change (test).

### S1-06: claimNext and settle

- **Delivers:** `claimNext`, start handling and settle in `@boxxy/dispatch`, and a benchmark script
  in `scripts/` that runs `claimNext` on the real store.
- **Depends on:** S1-04, S1-05.
- **Acceptance:**
  - Two `claimNext` calls on two connections to one file, started together 200 times with one free
    slot, never claim the same item phase and never exceed the slot count (test).
  - A claim writes the attempt, the item-phase lease, the slot lease, the decision row and both
    outbox facts, or none of them when a step throws (test).
  - Settle releases the item-phase lease and the slot lease and writes `boxxy.attempt.settled` in one
    transaction (test).
  - The benchmark at 5,000 open items reports lock p99 under 50 ms (the script's output in the PR).

### S1-07: Close-out

- **Delivers:** `@boxxy/closeout`: the build close-out type, the parser with every rejection in
  [the build close-out](#the-build-close-out), the `openItems` dedupe and the friction record.
- **Depends on:** S1-02.
- **Acceptance:**
  - Each rejection has a test, and one close-out with three problems returns all three (tests).
  - An `openItems` entry whose title matches a `core.issue` not yet done, after normalising, files
    nothing (test).
  - A friction entry with an unknown target kind fails the parse (test).

### S1-08: Server, contract and CLI

- **Delivers:** `@boxxy/contract`, `@boxxy/server` (Elysia, the oRPC router, configuration) and
  `@boxxy/cli` with every command in [the table](#commands-and-api) except `boxxy cost`,
  `boxxy attempt current` and the hook commands.
- **Depends on:** S1-06, S1-07.
- **Acceptance:**
  - An e2e test starts the server on a temporary store, files two items with the CLI, links one as
    blocking the other, defers one, expedites one, and reads the expected derived states and levers
    back with `boxxy item list` (end-to-end test).
  - The server refuses to bind to an address other than `127.0.0.1` (test).

### S1-09: The atc worker and the runner loop

- **Delivers:** `@boxxy/worker-atc` (spawn with the stamp, reconcile by session name) and the runner
  loop in `@boxxy/server`.
- **Depends on:** S1-08, A1.
- **Acceptance:**
  - The `WorkerKind` contract suite passes against the fake and against `worker-atc` with atc's
    client mocked at its oRPC boundary (test).
  - The spawn request carries the five `boxxy.*` attributes, percent-encoded (test).
  - An `unknown` start moves the attempt to `reconciling`, and a later reading of its session moves
    it to `running` (test).
  - An `absent` reading for an attempt in `running` settles it as `failed` with reason
    `session-lost`, and releases the item-phase lease and the slot lease (test).
  - A server restart with an attempt in `running` reconciles it before the first claim (test).
  - `boxxy runner pause` stops claims: with the runner paused, a ready item stays ready across 3
    ticks (test with the fake worker).
  - A live attempt on a scratch repo starts through atc, and its `claude_code.api_request` records
    in the local OTLP sink carry `boxxy.attempt` (live check, record lines quoted in the PR).

### S1-10: Commit and PR links

- **Delivers:** the Claude Code plugin in `apps/cli/plugin/`, the hook commands, `attempt.current`,
  `evidence.recordPr`, `@boxxy/forge-github` and the PR watch.
- **Depends on:** S1-09.
- **Acceptance:**
  - `boxxy hook pre-tool-use` denies `git commit -m "x"` in a boxxy session and allows
    `git commit -m "x" --trailer "Boxxy-Attempt: <attempt_id>"` (test with recorded hook payloads).
  - Both hooks exit 0 within 5 seconds with the server stopped, and with `ATC_SESSION_ID` unset
    (test).
  - `boxxy hook post-tool-use` on a recorded `gh pr create` payload links the PR (test).
  - The PR watch writes `commit_linked` once per trailer commit and `pr.merged` once, across two
    polls (test with the fake forge, and the `Forge` contract suite against GitHub mocked with msw).
  - The PR watch links an open PR whose commit trailer carries the id of a succeeded attempt with no PR linked
    (test with the fake forge).
  - A plain Claude Code session in the pepys repo, started without boxxy, runs no boxxy hook (live
    check: the session's hook log).

### S1-11: The outbox to pepys

- **Delivers:** `@boxxy/facts-pepys` (`FactSink` over P2) and the outbox sender.
- **Depends on:** S1-08, P2, P4.
- **Acceptance:**
  - The `FactSink` contract suite passes against the fake and against the adapter with pepys's
    route mocked (test).
  - An `unknown` append resends the same fact ids, and the fake sink sees each id applied once
    (test).
  - With the sink failing, claims and settles go on and `boxxy status` shows the outbox lag (test).
  - Facts from a live boxxy server appear in pepys's `facts.boxxy.work` stream (live check).

### S1-12: Cost to land

- **Delivers:** the `boxxy-work` consumer and the `boxxy.costToLand` query in the pepys repo, the
  cost reader in `@boxxy/facts-pepys`, and `boxxy cost`.
- **Depends on:** S1-11, P1, P3, P4.
- **Acceptance:**
  - The consumer's golden-fact test feeds a fixture of boxxy facts in two orders and gets the same
    rows (pepys test).
  - The query's golden test returns one row per item and model, counts a failed attempt's requests,
    leaves out a request with no `boxxy.attempt` attribute, and sums total input with both cache
    counts (pepys test).
  - `boxxy cost` prints the rows from a live pepys (live check).

### S1-13: The trial on pepys

- **Delivers:** the trial: the rules repo with the slice 1 rules, the server running on the owner's
  machine, and real pepys work filed in boxxy.
- **Depends on:** S1-10, S1-12.
- **Acceptance:**
  - One item goes from `item.file` through a build attempt, a PR, the repo's review gate and a
    merge to `done`, and `boxxy cost` shows its row with the model (live check, output in the PR).
  - With the boxxy server stopped, a pepys PR outside boxxy is opened, reviewed and merged with no
    boxxy error in its session or its checks (live check).
  - Every merged PR from a boxxy attempt has a `pr_linked` fact and at least one `commit_linked`
    fact (live check: a query over the store).
