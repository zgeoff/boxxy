# Slice 1

Build one unit of slice 1. Find your unit under [build order](#build-order), then read the unit and
each section and doc it links. Hand back one PR, as [AGENTS.md](../../../AGENTS.md) says, with every
Acceptance item of the unit met.

These traps cost most:

- Propagation reads every open item, including items that aren't ready
  ([planning](#planning-buildframe-and-decide)).
- `claimNext` throws on `lease-held` or `no-free-slot`, so the transaction rolls back the decision
  row with the claim ([claimNext](#claimnext)).
- A forced settle reason, such as `session-lost`, wins over the close-out's state
  ([settle](#settle)).
- An agent session id that belongs to another attempt writes no row
  ([agent sessions](#agent-sessions)).
- Fact delivery is at least once: a consumer drops a fact whose id it has already seen, so each new
  change needs its own fact id ([facts and the outbox](#facts-and-the-outbox)).

Slice 1 is the first working version of boxxy. It dispatches real build work for one repo, and
measures by model what each item cost to land, meaning to get its PR merged. The decision behind it
is [0014: the first slice](../../decisions/0014-first-slice.md).

Each section below links the design doc that owns the general rule, and this doc fixes what slice 1
builds. The [interface sketches](./sketches/README.md) own the shape of every type, port and
function. This doc owns the behaviour, and links each shape to the sketch file that holds it.

## Terms

Where another design doc owns a term, the link goes to that doc.

| Term | Meaning |
| --- | --- |
| item | A typed piece of work. Slice 1 has one kind, `core.issue`, an issue to build ([core model](./core-model.md#items)). |
| phase | One step of an item kind's pipeline. Slice 1's one phase is `build` ([core model](./core-model.md#phases)). |
| item phase | One phase of one item, such as the `build` phase of one issue. |
| attempt | One run of one phase on one item ([core model](./core-model.md#attempts)). An attempt can collect more than one agent session, such as when atc respawns its session. |
| agent session id | The id that the agent CLI gives its own session. Claude Code puts it on each telemetry record as `session.id`, and atc reports it as `agentSessionID`. boxxy records each agent session id of an attempt as a row in `attempt_sessions` ([the session-id join](#the-session-id-join)). |
| close-out | The typed report an agent sends at the end of its attempt ([close-outs](./close-outs.md)). |
| recipe | What an attempt runs with: agent, model, effort, prompt template and capacity source. Each attempt stores its recipe's content hash ([core model](./core-model.md#attempts)). |
| capacity source | What pays for an attempt's model use, such as a subscription account's usage window or a pay-per-token provider's balance ([capacity](./capacity.md#capacity-sources)). |
| the owner | The person who runs boxxy. |
| lever | An owner command that changes the order of work now, such as defer or expedite. boxxy stores each lever as a row in the store's `levers` table, with its actor, time and reason ([rules](./rules.md#levers-as-facts)). |
| live lever | A lever that is not past its `expires_at`, and that no later lever of its undo kind on the same item cancels. `plan.undefer` undoes `plan.defer`, and `plan.unexpedite` undoes `plan.expedite`. |
| fact | A record of one change, in pepys. boxxy writes a fact for every change to its store. |
| the fact catalog | The list of boxxy fact types, with a schema for each payload, in `@boxxy/model`. [Facts and the outbox](#facts-and-the-outbox) lists the types. |
| concept | One module that adds one planning idea, such as defer. A concept registers one or more plug-ins ([planning](./planning.md#concepts)). |
| open item | An item that is neither `done` nor `archived`. |
| `buildFrame` and `decide` | `buildFrame` reads every open item, runs the plug-ins and the propagation, and returns the frame. `decide` reads the frame and the pools, and returns the picks ([planning](#planning-buildframe-and-decide)). |
| frame | What `buildFrame` returns: the `ready` candidates, the holds and signal values the plug-ins gave them, and the faults. |
| plug-in | A function of one plug-in kind, which `buildFrame` calls for an item. Slice 1 has plug-ins of three kinds: signal, gate and waiver. |
| plug-in reference | How `rules.yaml` names a plug-in: a bare name, such as `oldest`, or a one-key map from the name to its parameters, such as `{ kind-order: { order: [chore, bug] } }`. |
| signal | A plug-in kind that gives an item a number. A pool sorts items by signals, lowest first. |
| gate | A plug-in kind that holds an item back, with a reason. A gate is liftable when a waiver may lift its hold. Every slice 1 gate is liftable. |
| waiver | A plug-in kind that lifts one gate's hold on one item. |
| admission | A plug-in kind that widens which pools may take an item. Slice 1 has none. |
| view | A plug-in kind that computes a read-only result from the frame, such as `explain`. Slice 1 has none. |
| propagation line | An entry under `propagation` in `rules.yaml`. It carries a signal's value across links of one type, and `buildFrame` runs it over every open item. The registry holds no propagation plug-ins. |
| pool | A named set of slots, with a filter for the work it takes and the signals it sorts by ([planning](./planning.md#pools)). |
| claim | What `claimNext` makes when it picks an item phase: an attempt and the two leases it runs under. |
| runner | The loop in the server that claims attempts, starts them and settles them ([the runner loop](#the-runner-loop)). |
| lease | The store's record that one attempt holds part of a claim. Each claim takes two leases. The item-phase lease is a row in `leases`, and makes the attempt the only live one on its item phase. The slot lease is the `holder` column of a `pool_slots` row, and holds one slot in a pool ([dispatch](./dispatch.md#leases-and-generations)). |
| lease generation | A number on each item-phase lease, one higher than the last lease on the same item phase. Every write about an attempt carries it, and the store refuses the write when the lease is released or the number differs. |
| the outbox | A table in the boxxy store that holds each fact until boxxy sends it to pepys. A change and its outbox rows commit in one transaction. |
| pepys | [pepys](https://github.com/zgeoff/pepys), an event store. boxxy sends its facts to pepys and reads cost from it. |
| pepys consumer | Code in a pepys deployment that reads one fact stream and keeps read tables from it. |
| scope mode | The pepys consumer mode that recomputes everything a consumer owns for one scope, such as one attempt, from all of that scope's facts, whenever one of them changes ([pepys consumers](https://github.com/zgeoff/pepys/blob/main/docs/design/pepys/consumers.md#input-modes)). |
| atc | [atc](https://github.com/zgeoff/atc) runs agent sessions. boxxy starts each attempt with atc's `session.spawn`. |
| hq | [hq](https://github.com/zgeoff/hq), the tool that hands tasks to agents. hq dispatches the tasks that build boxxy, the units in [build order](#build-order). |
| the local OTLP sink | An OTLP receiver on the owner's machine that writes the telemetry records it gets to files. atc's agent config points each agent's telemetry at it. boxxy doesn't build it, and S1-09's live check needs one running. |
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
- three planning concepts ([the slice 1 concepts](#the-slice-1-concepts)):
  - `pool`, which registers the `oldest` signal;
  - `defer`, which registers the `defer` gate and the `expedite-lifts-defer` waiver;
  - `expedite`, which registers the `expedite` signal, which a propagation line carries over
    `blocks` links;
- the build worker through atc, in `adapters/worker-atc`;
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
  hash, the store version, `pepys_offsets` and the plug-in faults. Slice 1 writes decision rows and
  never reads them.
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

- `@boxxy/rules`, in `modules/rules`, holds the rules loader and the rules version.
- `@boxxy/planning`, in `modules/planning`, holds `buildFrame`, `decide`, the slice 1 concepts, and
  the build step that generates the concept pins module.
- `@boxxy/dispatch`, in `modules/dispatch`, holds `claimNext`, `startClaim`, settle, reconcile, the
  commands, the logic of the outbox sender and the PR watch, and each port's fake and contract
  suite.
- `@boxxy/closeout`, in `modules/closeout`, holds the close-out parser, the criteria check and the
  `openItems` dedupe.

The adapters, tagged `adapter`:

- `@boxxy/store-sqlite`, in `adapters/store-sqlite`, holds the `ClaimStore` adapter: the schema, the
  migrations and the transactions.
- `@boxxy/worker-atc`, in `adapters/worker-atc`, holds the `WorkerKind` adapter for atc sessions.
- `@boxxy/facts-pepys`, in `adapters/facts-pepys`, holds the `FactSink` adapter and the reader for
  pepys's cost query.
- `@boxxy/forge-github`, in `adapters/forge-github`, holds the `Forge` adapter, which reads PRs and
  their commits.

The libs, tagged `lib`:

- `@boxxy/model`, in `libs/model`, holds every type that two or more packages share: the ids, the
  store rows, `Snapshot`, `StoreChange`, the port interfaces, the fact catalog, the plug-in
  interfaces (`Signal`, `Gate`, `Waiver`, `Concept`, `Pool`, `LoadedRules`), the `define…`
  helpers, `BuildCloseOut` with its zod schema, and a zod schema for each store row. It also holds
  the pure helpers several packages call: `deriveItemState`, `liveLevers`, `signalKey`, and the
  helpers both `ClaimStore`s share, `buildItemViews`, `buildAppliedChange`, `findSlotTake` and
  `toJsonValue`. It re-exports `ContentHash`.
- `@boxxy/content-hash`, in `libs/content-hash`, holds the `ContentHash` type, canonical JSON,
  `hashTree`, and the SHA-256 hashes for recipes, rules versions and snapshots.
- `@boxxy/contract`, in `libs/contract`, holds the oRPC contract that the server serves and the CLI
  calls. The CLI and the server are both apps, and an app can't import another app, so the contract
  lives in a lib, and it imports its types from `@boxxy/model`.

A lib does no I/O, as a module doesn't ([layout](./layout.md)).

Each package keeps its own fakes, factories and end-to-end tests, in the folders that
[layout](./layout.md#inside-a-package) sets. The end-to-end tests run as their own CI job.

## Ports and adapters

A module reaches an outside system through a port. Each port has a real adapter and a test fake. The
port types live in `@boxxy/model`, because `dispatch` and the adapters both use them. `dispatch`
drives all four slice 1 ports, so it holds each port's fake and contract suite.

| Port | Real adapter | Test fake |
| --- | --- | --- |
| `ClaimStore` | `@boxxy/store-sqlite` | `createMemoryClaimStore()` in `@boxxy/dispatch/test-utils/create-memory-claim-store` |
| `WorkerKind` | `@boxxy/worker-atc` | `createFakeWorker()` in `@boxxy/dispatch/test-utils/create-fake-worker` |
| `FactSink` | `@boxxy/facts-pepys` | `createFakeFactSink()` in `@boxxy/dispatch/test-utils/create-fake-fact-sink` |
| `Forge` | `@boxxy/forge-github` | `createFakeForge()` in `@boxxy/dispatch/test-utils/create-fake-forge` |

One contract test suite per port, in `@boxxy/dispatch`'s `src/test-utils/`, runs against the fake and against
the real adapter. A fake that passes the suite is safe to use in module tests. The `ClaimStore`
suite is `claimStoreContract` in `@boxxy/dispatch/test-utils/claim-store-contract`: a list of named
cases, each a check that takes a new store. The fake's test and the adapter's test each run every
case with `test.each`.

The port shapes are in [`02-ports.ts`](./sketches/02-ports.ts):

- `ClaimStore`, with `StoreReader` and `StoreTx`. `exclusive(work)` runs `work`, a function that
  gets a `StoreTx`, inside one write transaction. `read(work)` runs `work` with a `StoreReader`
  inside one read transaction. Each reader that derives item state, such as `readSnapshot`,
  `readItem` and `listItems`, takes `now` and `maxAttemptsByKind` from the loaded rules, and applies
  `liveLevers` and `deriveItemState` through `buildItemViews` from `@boxxy/model`. The reader loads
  each item that blocks an item it reads, so the blocked item's state is right.
- `StoreChange` and `ApplyResult`: one write of boxxy state, and why the store refused it
  ([one write path](#one-write-path)).
- `WorkerKind`, with `StartOutcome` and `SessionReading`: start an attempt, and read its session
  back ([the atc adapter](#the-atc-adapter)).
- `FactSink`: append outbox facts to pepys ([the pepys adapter](#the-pepys-adapter)).
- `Forge`, with `PullRequestReading`: read PRs and their commits
  ([the GitHub adapter](#the-github-adapter)).

Time, ids and configuration come into modules as arguments. The same file holds `Clock` and
`NewId`: only the apps hold them, and they pass `now` and `newId` to each module call.

The memory fake `createMemoryClaimStore()` keeps the [store rules](#store-rules) without SQLite:

- It chains `exclusive` calls on one promise, so they run one at a time.
- Each call works on a copy of the fake's state. The fake swaps the copy in when `work` resolves,
  and discards it when `work` throws, as ROLLBACK does.
- `read` sees the last committed state, never the copy of a running `exclusive` call.

### One write path

Every write of boxxy state goes through one `StoreChange`. A module builds the change as a pure
function of the command and the rows it read. Inside `exclusive`, the module passes the change to
`StoreTx.applyChange`, which writes every row and every outbox fact in it, or none of them.

The caller makes every fact id and the time. Each fact in the change carries its id, `manual:` and a
`newId()` value, and the change carries `at`, the time for each outbox row. The store makes no id and
reads no clock.

A change about an existing attempt names, in `under`, the leases it writes under: the item phase and
its lease generation. A settle also names the slot lease, with the slot `gen` that the attempt's
take made. A claim's change carries the item-phase lease and the slot lease with the attempt row. A
change with no `under` holds no lease: the commands, the PR watch and `evidence.recordPr` write that
way, so a hook that fires after settle still links its PR.

When `applyChange` refuses a change, it writes nothing and returns one of these:

- `stale-generation` when `under` names a lease that is released, or a generation that isn't the
  live one, or when a `release-slot` names a slot that its attempt doesn't hold;
- `lease-held` when the partial unique index on `leases` refuses a new item-phase lease;
- `no-free-slot` when the change takes a slot lease and the pool has no free slot;
- `guard-mismatch` when an update finds no row for its key, or a row its `expect` doesn't match.

A unique index that refuses an insert throws, and the transaction rolls back.

`applyChange` checks `under` first, then takes the slot, then applies the writes in order, then
writes the facts. The first refusal or throw stops it, and the store undoes that change's earlier
writes, the SQLite store with a savepoint. A work function that goes on after a refusal or a caught
throw keeps its earlier changes. Two `applyChange` calls on one `StoreTx` run one after the other,
even when the work function starts both at once.

A few writes are bookkeeping. Each changes no row that derived state or `decide()` reads. Each runs
on `StoreTx` outside `StoreChange`, writes no fact, and leaves the store version where it is:

- `markFactsSent`, by the outbox sender, sets `sent_at` on outbox rows that pepys accepted;
- `writeHeartbeat`, by the runner, sets the runner's `heartbeat_at`, and inserts the runner's row on
  its first beat;
- `markPullRequestChecked`, by the PR watch, sets a PR's `checked_at`;
- `syncPoolSlots`, on each rules load, adds and retires `pool_slots` rows
  ([store rules](#store-rules)).

### The atc adapter

atc publishes no client. It publishes its contract, `@atcx/contract`: `DAEMON_CONTRACT`, the oRPC
contract of every daemon procedure, with `resolveAtcPaths` for the daemon's socket and
`checkDaemon` for the version check. The adapter builds its own oRPC client from `DAEMON_CONTRACT`.
It speaks atc's [client protocol](https://github.com/zgeoff/atc/blob/main/docs/architecture/protocol/protocol.md):
JSON-line oRPC messages over the daemon's unix socket, after a `daemon.hello` handshake.

- `start` calls `session.spawn` with these fields from the stored spawn request: `cwd`, `name` set
  to `boxxy/<attempt_id>`, `prompt`, `agent`, `model`, `effort`, `pluginDirs`, and `idempotencyKey`
  set to the attempt id. The answer is `{ session }`, a session descriptor. A `started` outcome
  carries the descriptor's `id`, and its `agentSessionID` when it has one. A typed error answer from
  atc, such as a failed input check or an unknown agent, gives `refused`. No answer, a dropped
  socket or a timeout gives `unknown`.
- `reconcile` calls `session.list`, whose answer is `{ sessions }`, and finds the descriptor whose
  `name` is `boxxy/<attempt_id>`. When more than one has that name, a running one wins, then the
  newest. With no session of that name, the reading is `absent`. A `running` or `ended` reading
  carries the descriptor's `agentSessionID` when it has one.
- A descriptor's `state` is one of `running`, `needs_you`, `done` and `exited`. A session in `done`
  or `exited` has ended, and one in `running` or `needs_you` is running. A state the adapter doesn't
  know reads as running, and the adapter logs a warning.
- `reconcile` never treats an unknown idempotency key as proof that a spawn never ran. atc deletes
  completed keys after 24 hours.
- The import zones rule pins `@atcx/contract` and the atc socket to this package.

### The GitHub adapter

- `readPullRequest` reads one PR, its web URL and its commits over the GitHub REST API, with a token
  from the server's configuration.
- `listOpenPullRequests` lists a repo's open PRs over the same API.
- The import zones rule pins GitHub calls to this package.

### The pepys adapter

- `append` sends a batch of facts to pepys's fact-append route
  ([P2](#p2-a-fact-append-route-for-boxxy)). It returns `accepted`, `unknown` when no answer came, or
  `rejected` with pepys's error.
- `createCostReader(config)` calls pepys's `boxxy.costToLand` query for the `boxxy cost` command.

## The store schema

The store is one SQLite file in WAL mode, with `synchronous=NORMAL` and `busy_timeout` at 5,000 ms,
so a second `BEGIN IMMEDIATE` waits for the first. Migrations run through Kysely's
`Migrator` with an in-code provider. Only `adapters/store-sqlite` imports `bun:sqlite`
and `kysely`.

The store opens the file twice. `exclusive` runs on the first handle, and `read` runs on the second,
so a read sees the last commit and never the writes of a running `exclusive` call. One `read` call
keeps the snapshot of its first query, even when a commit lands before it ends. Each table is
`STRICT`. A time is an integer of milliseconds, a flag is `0` or `1`, and a list or an object is
canonical JSON text, so a guard on a JSON column matches whatever the key order of its value. The store parses each row it reads with the row's zod schema from `@boxxy/model`.

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
| `acceptance` | the acceptance criteria, as a JSON list of `{ id, text, evidence }`: `item.file` gives the ids `a1`, `a2`, … in order, and `evidence` lists the evidence ids that settle copies in, empty until then | no |
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
| `reason` | the reason the actor gave | yes |
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
| `slot_gen` | the slot's `gen` after the attempt's take | no |
| `lease_gen` | the generation of the attempt's item-phase lease | no |
| `spawn_request` | the exact spawn request, as JSON | no |
| `spawn_request_hash` | the spawn request's content hash | no |
| `state` | the attempt state | no |
| `failure` | the failure reason | yes |
| `atc_session` | atc's current session id for the attempt, which reconcile reads | yes |
| `close_out` | the latest valid close-out, as JSON | yes |
| `claimed_at` | when the claim committed | no |
| `started_at` | when atc started the session | yes |
| `ended_at` | when the attempt settled | yes |

### `attempt_sessions`

Each row is one agent session of one attempt. The primary key is `(attempt, agent_session)`, and
`agent_session` is unique, so one agent session belongs to one attempt.

| Column | Holds | Nullable |
| --- | --- | --- |
| `attempt` | the attempt id | no |
| `agent_session` | the agent CLI's own session id | no |
| `atc_session` | atc's session id that carried the agent session | no |
| `seen_at` | when the runner first saw the pair | no |

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

Each row is one slot in a pool, and its `holder` column is the slot lease. The primary key is
`(pool, slot)`. A take is this guarded update, which must change one row:

```sql
UPDATE pool_slots SET holder = ?, gen = gen + 1
WHERE pool = ? AND slot = ? AND holder IS NULL AND retired = 0
```

| Column | Holds | Nullable |
| --- | --- | --- |
| `pool` | the pool | no |
| `slot` | the slot number | no |
| `holder` | the slot lease: the attempt that holds the slot | yes |
| `gen` | the slot's generation, one higher on each take. A settle names it in `under`, so a stale release of an old slot lease changes nothing | no |
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
`pr`, `commit`, `test`, `ci-run` and `live-check`, and its `source` is one of `hook`, `trailer`,
`agent` and `watch`, for the PR watch.

| Column | Holds | Nullable |
| --- | --- | --- |
| `fact_id` | the id of the evidence fact | no |
| `attempt` | the attempt | no |
| `kind` | the evidence kind | no |
| `ref` | what the evidence points at, as text: a PR URL, a commit sha, a test file and name, a CI run URL, or a live check's URL or command | no |
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

The primary key is `id`, the runner id from the server's configuration, so the row keeps the paused
flag across restarts. `runner.pause` and `runner.resume` upsert the row in a `StoreChange` with their
fact.

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
| `fact_id` | the fact id, `manual:<uuidv7>` | no |
| `type` | the fact type | no |
| `entity` | the fact's entity | no |
| `actor` | the fact's actor | no |
| `at` | when the change was applied | no |
| `payload` | the fact payload, as JSON | no |
| `sent_at` | when pepys accepted the fact | yes |

### Store rules

- **Every `ClaimStore` runs `exclusive` calls one at a time.** SQLite does it with
  `BEGIN IMMEDIATE`, and the memory fake with one promise chain
  ([ports and adapters](#ports-and-adapters)).
- **The store version** is the highest `outbox.seq`. Every change writes at least one outbox row in
  the same transaction as the change, so the store version moves with every change.
- **The partial unique index on `leases`** allows one live item-phase lease per item phase. The
  guarded update on `pool_slots` allows one holder per slot. A claim takes the item-phase lease and
  the slot lease in one `StoreChange`.
- **A new item-phase lease's `gen`** is one more than the highest `gen` for that item phase. The
  attempt stores it as `lease_gen`. Every change about the attempt after the claim, such as a
  start, a close-out or a settle, puts that generation in `under`.
- **A claim names the pool, and the store picks the slot.** The claim's change writes `slot` and
  `slotGen` as `0` in the attempt row and the `boxxy.attempt.claimed` payload. Inside
  `applyChange`, the adapter takes the lowest free slot that isn't retired, and writes the slot's
  number and new `gen` into both.
- **A lever insert leaves `seq` to the store.** The change writes `seq` as `0`, and `applyChange`
  writes the real `seq` into the row and the `boxxy.lever.recorded` payload. It pairs them in order:
  a change's second lever insert gets its `seq` in the change's second `boxxy.lever.recorded` fact.
- **An `attempt_sessions` row** is inserted only after a read in the same `exclusive` call
  ([agent sessions](#agent-sessions)).
- **Pool slots follow the rules.** On each rules load, `syncPoolSlots` adds slot rows up to each
  pool's `slots` count, and marks the rows above the count `retired`. It retires every row of a pool
  that the rules no longer name. It never deletes a row, and it writes no fact.
  - A retired slot keeps its holder until that attempt settles.
  - When a pool grows again, its retired rows return to use, and each row's `gen` carries on from
    where it was.
- **`pepys_offsets`** is `{}` in every slice 1 decision, because `decide()` reads nothing from pepys
  yet. The column exists so `explain` can read the observation boundary
  ([dispatch](./dispatch.md#the-observation-boundary)) when a later concept reads pepys facts.
- **S1-06's benchmark script measures `claimNext` on this store.** It must report a lock p99 under
  50 ms at 5,000 open items. The lock time runs from `BEGIN IMMEDIATE` to the commit
  ([dispatch](./dispatch.md#the-benchmark-measured) gives the reference figures).

### Derived item state

`deriveItemState(item, rows)` in `@boxxy/model` returns the first state in this table whose
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
- The kind's `maxAttempts` comes from the first phase of its pipeline, the only phase a slice 1 kind
  has. An item whose kind the loaded rules don't name never reaches "attempts used up".
- When the PR watch finds the PR of an attempt in "no PR linked", it links the PR
  ([links](#links-to-commits-and-prs)), and the item waits on "PR open".

## Rules for slice 1

Rules live in a git repo. The server reads them from a checkout whose path is in its configuration
([rules](./rules.md)), and refuses a checkout with uncommitted changes. One file, `rules.yaml`,
holds slice 1's policy, and the recipe's prompt template sits beside it:

```yaml
# rules.yaml
version: 1

concepts: # name@version; each concept's pin ships with its package
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
    order: [oldest] # plug-in references: a bare name, or { name: { parameters } }

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

A signal with parameters takes a one-key map in `order` or `lead`, such as
`order: [oldest, { kind-order: { order: [chore, bug] } }]`. No slice 1 signal takes parameters, so
the example uses bare names.

- **The server reads the checkout, and the loader reads no file.** The server passes `loadRules`
  the commit hash and a map from each file's path, relative to the checkout's root, to its bytes.
- **The loader rejects** each of these, and reports it with the file, the path in the file, such as
  `pools[0].order[1]`, and the reason. It returns every rejection it finds in one result.
  - a checkout with no `rules.yaml`, or a `rules.yaml` that isn't valid YAML, or that fails the
    file's schema (`invalid`). The schema refuses an unknown field, a pipeline phase with no
    `maxAttempts`, a concept pinned twice and two pools with one name. Two pinned concepts that
    register one plug-in name are `invalid` too, at the second concept's entry. Before the schema
    check, the loader refuses each `__proto__` key, and a file with one gets only those
    rejections;
  - an unknown concept name, or a known name at a version no concept has;
  - a pool whose `order` or `lead` names a signal no pinned concept registers;
  - a plug-in reference whose parameters fail the plug-in's `params` schema (`bad-plugin-params`).
    For a gate, the path is the entry in `concepts` that pins the gate's concept;
  - a propagation line over a link type other than `blocks`, or for a signal with no `combine`;
  - a kind with no recipe for a pipeline phase, or one that names a recipe `recipes` doesn't
    define;
  - a missing prompt file. A recipe's `prompt` is the file's path from the checkout's root, with
    `/` between folders. The schema refuses an empty, `.` or `..` folder in it.

  The server checks the checkout for uncommitted changes before it calls the loader, and reports
  them as `uncommitted-changes`.
- **A pool's `takes` maps each filter field to one name or a list of names.** The loader turns one
  name into a list of one. A kind's `pipeline` list becomes a pipeline named after the kind. A
  pool's order holds each signal key once: a signal that `lead` names keeps its place from `lead`.
- **The loader resolves every plug-in reference** to its plug-in and its parsed parameters, and
  `LoadedRules` carries them ([`01-registries.ts`](./sketches/01-registries.ts)), so `buildFrame`
  calls each plug-in with its own parameters. A bare name parses `{}`. A signal's key is
  `signalKey(name, params)`: the name, `#`, and the content hash of the parameters' canonical JSON.
- **Every gate and waiver of a pinned concept runs.** `rules.yaml` lists no gates, so the loader
  checks each gate's parameters as `{}`.
- **Concepts take no parameters in slice 1.** `rules.yaml` names each concept as `name@version`
  only.
- **The rules version** is the content hash of the checkout's commit hash, the bytes of every file
  the loader read, and each concept pin ([rules](./rules.md#the-rules-version)). A pin is
  `name@version` with the content hash of the concept's TypeScript source: its module file and every
  file inside `@boxxy/planning` that it imports, transitively.
- **The build computes the pins, and the server passes them in.** `@boxxy/planning`'s build step runs
  the repo tool `scripts/concept-pins.ts`, which hashes each concept's source and writes the module
  `src/generated/concept-pins.ts`. The module is committed, and the root check fails when it is
  stale. The server imports `concepts` and `conceptPins` from `@boxxy/planning`, and passes both to
  `loadRules`. `@boxxy/rules` never imports `@boxxy/planning`. The pins are keyed by concept name,
  so the server compiles in one version of each concept, and passes a pin for each one. The loader
  throws when a pinned concept has no matching pin, because only a server bug reaches that.
- **The server checks the checkout for a new commit each tick**, and reloads the rules by
  [the rules version](./rules.md#the-rules-version) rule. `boxxy status` shows a rejected commit.
- **The recipe hash** is the content hash of the recipe's fields, the prompt template's bytes, the
  plugin folder's hash, and the rules version. The loader can't see the plugin folder, so
  `claimNext` computes the hash from the `spawnContext` the server passes it. The slice 1 recipe
  hash leaves out skills and the repo's instruction files.
- **Canonical JSON** in `@boxxy/content-hash` follows RFC 8785, the JSON Canonicalization Scheme. It
  throws on a value JSON can't hold, such as `NaN` or `undefined`.
- **The plugin folder's hash** is `hashTree` in `@boxxy/content-hash`. The server walks the folder,
  takes regular files only and follows no links. `hashTree` writes each path relative to the folder
  with `/`, sorts by the paths' UTF-8 bytes, and hashes the canonical JSON list of
  `{ path, sha256, executable }`.
- **The prompt template** is Markdown with `{{name}}` placeholders. The server replaces each with
  its value: `{{title}}`, `{{outcome}}`, `{{acceptance}}` (each criterion with its id), `{{repo}}`,
  `{{attempt_id}}`, and `{{trailer}}`, `{{evidence_command}}` and `{{closeout_command}}`, the
  commands for the [trailer](#links-to-commits-and-prs), evidence and
  [close-out](#the-build-close-out). `claimNext` renders it from the template text in
  `spawnContext`.
- **The prompt tells each attempt to make its own git worktree** in the target repo, named after the
  attempt id, and to work only there. Two slots of one pool start their sessions in the same repo
  path, so without this they would share one working tree.
- **S1-09 ships a minimal `prompts/build-v1.md`** that uses every value, in an example rules checkout
  at `apps/server/src/test-utils/rules/`, beside an example `rules.yaml`. S1-13 copies both into the rules
  repo and tunes the prompt.
- **One configuration file holds the machine details:** the runner id, the store file, the rules
  checkout's path, the plugin folder's path, the hook log's path, each repo's local path, the atc and
  pepys endpoints, and the tokens. The server and the CLI both read it, from the path in
  `BOXXY_CONFIG`, so the hooks and `boxxy cost` work with the server stopped. The rules hold none of
  these details.

## Planning: buildFrame and decide

`buildFrame` and `decide` are pure functions in `@boxxy/planning`. `decide()` never refers to a
concept by name: it reads the frame and the pools ([planning](./planning.md#buildframe-and-decide)).

[`04-planning.ts`](./sketches/04-planning.ts) holds the shapes. `Snapshot` is what `claimNext`
reads, `buildFrame` returns a `Frame`, and `decide` returns a `Decision` of `Pick`s. The loader
builds each `Pool` with the `lead` signals at the front of its `order`.

`buildFrame` reads every open item in the snapshot. Its candidates are the open items in state
`ready`. It runs these steps in order:

1. Each signal that a propagation line carries, such as `expedite`, computes its value for every
   open item, from the item and its live levers.
2. `buildFrame` runs each propagation line over the open items
   ([the slice 1 concepts](#the-slice-1-concepts)).
3. Each gate decides whether it holds each candidate.
4. Each waiver may lift one gate's hold on a candidate, reading the propagated values.
5. Each other signal, such as `oldest`, computes its value for each candidate.
6. Each filter field that a concept's `filterFields` declares gives its value for each candidate,
   and `buildFrame` puts the values in the frame's `fields`.

`decide` picks only candidates. It walks the pools in declared order. For each pool, it takes the
candidates with no hold whose `fields` match the pool's `takes`, and that no earlier pool picked. A
field with no value never matches. It sorts them by the pool's `order`, then by item id. A lower
value sorts first, and an item with no value for a signal sorts after every item with one. It picks
one item per free slot.

### Plug-in kind interfaces

Slice 1 has plug-ins of three kinds: signal, gate and waiver. The registry also declares
`admission` and `view`, with no slice 1 plug-in. `buildFrame` runs the propagation lines itself.

[`04-planning.ts`](./sketches/04-planning.ts) holds `PlanContext` and the `Signal`, `Gate` and
`Waiver` interfaces. [`01-registries.ts`](./sketches/01-registries.ts) holds `Concept`, which
registers a concept's signals, gates, waivers, levers and `filterFields`. A signal gets the
parameters from its plug-in reference, and a gate gets `{}`; the loader checks both against the
plug-in's `params` schema ([rules for slice 1](#rules-for-slice-1)). The `defer` gate's `params` is
an empty object.

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
- `defer` holds an item that has a live `plan.defer` lever. When the item has more than one, the
  latest live defer wins. The hold lasts until the lever's `until`, or, with no `until`, until a
  `plan.undefer`. Its hold is liftable.
- `expedite-lifts-defer` lifts a `defer` hold on any candidate with an `expedite` value, propagated
  values included.
- `expedite` gives the item's position among the live `plan.expedite` levers, oldest first, so the
  first expedite sorts first. An item with two live expedites takes the position of its oldest one.
  Its `combine` is `min`.

The `pool` concept declares the pool filter fields `phase`, `kind` and `repo` in its
`filterFields`. The `defer` concept registers the levers `plan.defer` and `plan.undefer`. The
`expedite` concept registers the levers `plan.expedite` and `plan.unexpedite`.

For each propagation line, `buildFrame` starts from every open item with a value for the line's
signal. It walks the named link type in the named direction, and gives each open item it reaches
the value, combined by the signal's `combine`. It stops at an item it has already visited.

A `blocked` item is never a candidate. Propagation still reads it, so an expedited blocked item
gives its blockers its `expedite` value, and they run first.

## claimNext

`claimNext(input)` in `@boxxy/dispatch` claims at most one item phase. The runner calls it whenever a
slot may be free.

[`05-dispatch.ts`](./sketches/05-dispatch.ts) holds the shapes of `claimNext`, `SpawnContext` and
`Claim`. The app passes in the store, the runner id, the loaded rules, `now`, `newId` for attempt,
decision and fact ids, and a `spawnContext`. The server builds `spawnContext` from its configuration
and the rules checkout: each repo's local path, the plugin folder's path and hash, and each recipe's
prompt template text. A module reads no files, so `claimNext` gets these as input.

All of these steps run inside one `store.exclusive` call, so inside one `BEGIN IMMEDIATE`
transaction:

1. Read the runner's row. When it is paused, return `null`.
2. Read the snapshot with `readSnapshot(now, rules.maxAttemptsByKind)`, which holds the store
   version.
3. Hash the snapshot with `@boxxy/content-hash`.
4. Run `buildFrame`, then `decide`. With no pick, return `null` and write nothing.
5. For the first pick, read the item phase's last lease generation with `readLastLeaseGen`.
6. Build the spawn request from the recipe and `spawnContext`: cwd from the repo's path, the prompt
   rendered from the template text, the agent, model and effort, the plugin folder's path, the name
   `boxxy/<attempt_id>` and the idempotency key. Compute the recipe hash with the plugin folder's
   hash.
7. Apply one `StoreChange` that holds the item-phase lease at the next generation, a slot lease in
   the pick's pool, the attempt row in state `starting`, the decision row, and the outbox facts
   `boxxy.attempt.claimed` and `boxxy.decision.recorded`. The store picks the slot
   ([store rules](#store-rules)).
8. When `applyChange` returns `lease-held` or `no-free-slot`, throw. Either result means a race that
   `decide` didn't see, and the throw rolls back the decision row with the rest of the claim.
9. Commit, and return the claim.

The runner catches the throw from step 8, logs it, and ends that tick's claim loop.

The claim holds the attempt row as written, with the slot and slot `gen` the store took, and the
spawn request. The runner passes it to `startClaim` in `@boxxy/dispatch`, which starts the attempt
after the commit, outside the lock:

- `started`: apply a change under the claim's generation that moves the attempt to `running` with
  atc's session id, and writes `boxxy.attempt.started`. When the outcome carries an agent session
  id, the same change records it ([agent sessions](#agent-sessions)).
- `refused`: settle the attempt with the forced reason `spawn-refused` ([settle](#settle)).
- `unknown`: apply a change under the claim's generation that moves the attempt to `reconciling`,
  and writes `boxxy.attempt.reconciling`.

## The runner loop

The server runs one runner. Each tick, every 5 seconds by default:

1. Write the runner's heartbeat with `writeHeartbeat`. Then check the rules checkout for a new
   commit, and reload the rules when it has one ([rules for slice 1](#rules-for-slice-1)).
2. Call `claimNext` until it returns `null` or throws, and start each claim.
3. Reconcile each attempt in `starting`, `running` or `reconciling` through `WorkerKind.reconcile`,
   and act on the reading by the table below.
4. Run the outbox sender ([facts and the outbox](#facts-and-the-outbox)).
5. Every 5 minutes, run the PR watch ([links](#links-to-commits-and-prs)).

Each change below runs under the attempt's generation.

| Reading | Attempt state | Action |
| --- | --- | --- |
| `running` | `starting` | move the attempt to `running` with atc's session id, and write `boxxy.attempt.started` |
| `running` | `reconciling` | move the attempt to `running` with atc's session id, and write `boxxy.attempt.reconciled` |
| `running` | `running` | record a new agent session ([agent sessions](#agent-sessions)) |
| `ended` | any | settle the attempt |
| `absent` | `starting` | send the stored spawn request again, with the same idempotency key |
| `absent` | `running` | settle the attempt with the forced reason `session-lost` |
| `absent` | `reconciling` | send the stored spawn request again, with the same idempotency key |

An `absent` reading on a `starting` attempt means the server stopped between the claim's commit and
the spawn. When atc still shows no session for a `starting` or `reconciling` attempt 10 minutes
after the claim, settle the attempt with the forced reason `spawn-lost` and send nothing.

When the server starts, it reconciles every attempt in `starting`, `running` or `reconciling` before
its first claim.

### Settle

`settleAttempt` in `@boxxy/dispatch` settles one attempt in one `exclusive` call. It reads the
attempt, its item and the repo's open `core.issue` items, and applies one `StoreChange` under the
attempt's generation and its slot lease. It returns the store's answer, and the runner logs a
refusal and moves on. Build the change with these steps:

1. Set the attempt's state. A forced reason (`spawn-refused`, `session-lost` or `spawn-lost`) gives
   `failed` with that reason, whatever the close-out says. With no forced reason, the latest valid
   close-out decides: `built` gives `succeeded`, and `blocked` or `abandoned` gives `failed` with
   the close-out's reason. With no valid close-out, the state is `failed` with reason
   `closeout-missing`.
2. Release the item-phase lease and the slot lease. Set the attempt's `ended_at` to the tick's
   `now`.
3. Copy the evidence ids that the latest valid close-out cites for each criterion into the item's
   `acceptance`.
4. File each entry in the latest valid close-out's `openItems` through dedupe, and record each
   friction entry. Do this whatever the attempt's state, a forced reason included.
5. Write `boxxy.attempt.settled`, with the copied evidence ids, the items that dedupe matched, and
   the count of friction entries the parser dropped. Write the facts for step 4 in the same change.

### Agent sessions

atc may report an agent session id after the session starts, and an attempt can collect more than
one, such as when atc respawns the session. The cost query needs every one
([the session-id join](#the-session-id-join)). The runner records each pair of atc session id and
agent session id in `attempt_sessions`:

- **The runner inserts a row** from a `started` outcome that carries an agent session id, and from a
  `running` or `ended` reading that carries an agent session id the table doesn't yet hold for that
  attempt.
- **The runner reads before it inserts.** Inside the same `exclusive` call as the insert, it calls
  `findAttemptByAgentSession`. When the id already belongs to this attempt, it writes no row. The
  unique index on `agent_session` is only a backstop.
- **Each new row writes `boxxy.attempt.session_bound`,** in the same `StoreChange` as the row and
  the reading's action from the runner loop's table, such as a settle. The same change sets the
  attempt's `atc_session` to the atc session id that carried the new agent session.
- **An agent session id that belongs to another attempt writes no row and no `session_bound`
  fact.** `bindSession` in `@boxxy/dispatch` returns the fault, the server logs it, and the rest of
  the change, such as a move to `running` or a settle, still lands.

## The build close-out

The agent sends its close-out with `boxxy attempt close-out` before its session ends. The type
follows [close-outs](./close-outs.md#the-build-close-out). Slice 1 fixes the parts that doc leaves
proposed.

[`00-core.ts`](./sketches/00-core.ts) holds the shape, `BuildCloseOut`: a result of `built`,
`blocked` or `abandoned`, the evidence cited for each criterion, `openItems`, and friction entries.
[`06-closeouts.ts`](./sketches/06-closeouts.ts) holds the parser, the criteria check and the
dedupe.

- **A friction entry's target kind** is one of `skill`, `rule`, `lint`, `agents-md` and `tool`. A
  target of any other kind fails the parse. An entry with no target is dropped, as
  [decision 0009](../../decisions/0009-close-outs-hold-what-only-the-agent-knows.md) says, and the
  parser counts it in `frictionDropped`.

- **Evidence ids** are the `fact_id`s of the attempt's `evidence` rows. The PR hook and the PR watch
  write PR and commit evidence. The agent writes test, CI run and live check evidence with
  `boxxy attempt evidence`, which prints the new fact id.
- **The parser rejects** a close-out that fails the schema, cites a criterion the item lacks, cites
  an evidence id that belongs to another attempt, or has result `built` while a criterion has no
  evidence. The parser returns every problem at once, and the CLI prints them all, so the agent can
  fix the close-out and send it again.
- **The latest valid close-out wins.** Each valid one writes `boxxy.attempt.closed_out`.
- **Dedupe matches an `openItems` entry** to an open `core.issue` in the same repo whose title is
  equal after lowercasing, trimming, and collapsing each run of whitespace to one space. A match
  files no new item. It links the existing item to the attempt: the attempt's
  `boxxy.attempt.settled` fact lists it in `matched`. With no match, settle files a new item with
  the entry's `body` as its outcome, the repo of the attempt's item, and an empty acceptance list,
  so it starts as an `idea`, with `found_in_attempt` set.
- **Friction** becomes a `boxxy.proposal.recorded` fact. Slice 1 acts on it no further.

## Links to commits and PRs

[Decision 0012](../../decisions/0012-link-attempts-by-trailer-and-hook.md) sets how attempts link to
commits and PRs. Slice 1 builds the links with a Claude Code plugin that atc loads into each boxxy
session through `pluginDirs`, and with the PR watch in the server. The plugin lives in
`apps/cli/plugin/` and runs two hook commands, `boxxy hook …`, from the `boxxy` on the session's
`PATH`. Each hook writes its log to the hook log path in boxxy's
[configuration file](#rules-for-slice-1).

### Finding the attempt

The hooks and the `boxxy attempt` commands find their attempt by `ATC_SESSION_ID`, which atc sets in
every session it starts. The `PreToolUse` hook calls `attempt.current`, and the `PostToolUse` hook
passes the id to `evidence.recordPr`. The server looks the attempt up with
`findAttemptBySession`, which matches only once the runner has recorded the atc session id. The
runner records it from a `started` outcome, or from the next tick's reading, within about 5 seconds.
Before then, and for a `reconciling` attempt with no session yet, the lookup misses:

- the hooks exit 0 and allow the call;
- the PR watch links any PR that the `PostToolUse` hook missed;
- the `boxxy attempt` commands answer `no-live-attempt`, so the agent retries.

### The hooks and the PR watch

- **The trailer is `Boxxy-Attempt: <attempt_id>`.** The prompt tells the agent to commit with
  `git commit --trailer "Boxxy-Attempt: <attempt_id>"`. The `PreToolUse` hook,
  `boxxy hook pre-tool-use`, denies a Bash `git commit` call that passes `-m` or `--message` without
  that trailer, and puts the exact flag to add in its deny reason. The hook allows every other call.
  It also allows the commit when the API is down or the session holds no attempt.
- **When the agent opens a PR, the `PostToolUse` hook links it.** The hook,
  `boxxy hook post-tool-use`, matches a Bash call whose command runs `gh pr create`. It reads the PR
  URL from the command's output and calls `evidence.recordPr`. The server writes a `pr` evidence
  row with source `hook`, adds the PR to `pull_requests`, and writes `boxxy.evidence.pr_linked`.
  When the PR is already linked to this attempt, `evidence.recordPr` answers `linked` again and
  writes nothing.
- **The PR watch and `evidence.recordPr` write with no lease.** Their changes carry no `under`,
  because settle has released a succeeded attempt's lease. The watch's facts carry the actor
  `boxxy:runner:<runner_id>`. The watch takes each PR's URL from `PullRequestReading.url`.
- **Every 5 minutes, the PR watch reads each open PR** in `pull_requests`, and sets its
  `checked_at` with `markPullRequestChecked`. For each commit in the PR whose `Boxxy-Attempt`
  trailer carries the id of an attempt of the same item, the watch writes a `commit` evidence row
  with source `trailer` and `boxxy.evidence.commit_linked`, once per commit. When the PR has merged,
  the watch writes `boxxy.pr.merged`. When the PR has closed without a merge, it writes
  `boxxy.pr.closed`.
- **The PR watch also links each PR the hook missed.** For each attempt that succeeded with no PR
  linked, the watch lists the repo's open PRs. It links the first PR with a commit whose trailer
  carries that attempt's id. It writes the same rows and fact as `evidence.recordPr`, with source
  `watch`.
- Both hooks exit 0, print nothing on failure, and give up after 5 seconds.

## The session-id join

boxxy joins each telemetry record to its attempt by the record's agent session id
([measurement](./measurement.md#spend-capture)). The spawn request carries no telemetry settings,
and boxxy sets no telemetry attributes on the session.

- **atc turns telemetry on.** atc's own agent config sends each agent's telemetry to the local OTLP
  sink ([A1](#a1-agent-session-ids-and-telemetry-config-in-atc)).
- **Claude Code puts the id on each record.** Every telemetry record Claude Code sends carries a
  `session.id` attribute, which is its agent session id.
- **atc records the id.** atc stores each session's agent session id as `agentSessionID`.
- **boxxy records each id with its attempt.** boxxy spawns each session itself, so the attempt row
  holds the item, phase and recipe. The runner writes a row in `attempt_sessions` for each agent
  session id it sees for the attempt ([agent sessions](#agent-sessions)).
- **The cost query joins at read time.** A record belongs to the attempt whose `attempt_sessions`
  row has `agent_session` equal to the record's `session.id`. An attempt's cost sums the records of
  all its agent sessions. A record sent before the runner wrote the row still joins. A record whose
  `session.id` matches no row belongs to no attempt.
- **Each record counts toward one attempt at most,** whatever atc's investigation finds
  ([A1](#a1-agent-session-ids-and-telemetry-config-in-atc)). An id that changes mid-session becomes
  a second row of the same attempt. An id that a second attempt reports writes no row, so its
  records stay with the first attempt.

Slice 1 runs Claude Code only. A1 holds the open question about Codex.

## Facts and the outbox

Every state change in the store writes its facts to the outbox in the same transaction as the change
([decision 0013](../../decisions/0013-one-write-path-per-fact.md)). The outbox sender in the server
sends unsent rows in `seq` order, in batches of up to 100, through `FactSink`. The pepys adapter
builds each envelope from its outbox row, and adds the row's `seq` to the payload as `storeVersion`.
The catalog's payload schemas leave `storeVersion` out.

Every fact the runner writes carries the actor `boxxy:runner:<runner_id>`: claims, starts,
reconciles, settles, the PR watch's facts, and the items and proposals that settle files. An item
that settle files has `filed_by` set to `boxxy:attempt:<attempt_id>` and the repo of the attempt's
item.

- On `accepted`, the outbox sender marks the rows sent with `markFactsSent`, a bookkeeping write
  ([one write path](#one-write-path)).
- On `unknown`, the outbox sender sends the same rows again on the next tick.
- On `rejected`, the outbox sender stops and logs pepys's error. The rows stay unsent until a fixed
  boxxy release sends them again.

`boxxy status` shows the outbox lag, which is the oldest unsent fact's age, and the latest failed
send, `unknown` or `rejected`, with its error. A pepys outage grows only the outbox. Claims and
attempts go on.

Fact delivery is at least once. pepys stores a retried append twice, and each consumer drops the
copy by its fact id. The outbox and [P1](#p1-claude-code-telemetry-as-facts) both rely on that:

- A resend carries the row's own `fact_id`, so every consumer drops the copy.
- Two distinct changes always get two rows, so they never share an id.

Each fact uses pepys's envelope
([pepys log design](https://github.com/zgeoff/pepys/blob/main/docs/design/pepys/log.md#the-fact-envelope)),
on one stream, `facts.boxxy.work`:

| Envelope field | Value |
| --- | --- |
| `id` | the outbox row's `fact_id`: `manual:<uuidv7>`, from the `newId()` of the caller that built the change, with the `manual:` prefix |
| `type` | the fact type, from the table below |
| `v` | `1` |
| `api` | `boxxy/1` |
| `entity` | the entity for the fact type, from the table below |
| `actor` | an entity id: `boxxy:owner:local`, `boxxy:runner:<runner_id>`, `boxxy:attempt:<attempt_id>` or `boxxy:hook:<attempt_id>` |
| `at` | the change's `at`, which the caller sets |
| `payload` | the change, typed per fact type in `@boxxy/model`, with `storeVersion` |

Every entity id has the form `boxxy:<kind>:<id>`, and every actor is an entity id. pepys needs no
registration for boxxy's fact types.

| Type | Entity | Written by | Payload |
| --- | --- | --- | --- |
| `boxxy.item.filed` | `boxxy:item:<item_id>` | `item.file` | the item row |
| `boxxy.item.filed` | `boxxy:item:<item_id>` | settle, for `openItems` | the item row |
| `boxxy.item.edited` | `boxxy:item:<item_id>` | `item.edit` | the changed fields |
| `boxxy.item.closed` | `boxxy:item:<item_id>` | `item.close` | the reason |
| `boxxy.link.added` | `boxxy:link:<source_id>:<type>:<target_id>` | `link.add` | source, target and type |
| `boxxy.link.added` | `boxxy:link:<source_id>:<type>:<target_id>` | `item.file`, one per `--blocked-by`, in the same change as the item | source, target and type |
| `boxxy.link.removed` | `boxxy:link:<source_id>:<type>:<target_id>` | `link.remove` | source, target and type |
| `boxxy.lever.recorded` | `boxxy:item:<item_id>` | `plan.*` and `item.retry` | the lever row |
| `boxxy.attempt.claimed` | `boxxy:attempt:<attempt_id>` | `claimNext` | item, phase, number, pool, slot, gen, recipe hash and rules version |
| `boxxy.decision.recorded` | `boxxy:decision:<decision_id>` | `claimNext` | the decision row |
| `boxxy.attempt.started` | `boxxy:attempt:<attempt_id>` | the runner, on a `started` start or reconcile | atc session id |
| `boxxy.attempt.reconciling` | `boxxy:attempt:<attempt_id>` | the runner, on an `unknown` start | the reason |
| `boxxy.attempt.reconciled` | `boxxy:attempt:<attempt_id>` | reconcile | atc session id |
| `boxxy.attempt.session_bound` | `boxxy:attempt:<attempt_id>` | the runner, with each new `attempt_sessions` row | `{ atcSession, agentSession, seenAt }` |
| `boxxy.attempt.closed_out` | `boxxy:attempt:<attempt_id>` | `attempt.closeOut` | the close-out |
| `boxxy.attempt.settled` | `boxxy:attempt:<attempt_id>` | settle | state, failure reason, end time, the evidence ids copied into each criterion, the items dedupe matched, and the count of dropped friction entries |
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

**The consumer, `boxxy-work`,** runs in scope mode on `facts.boxxy.work`, with one scope per entity:
an item, an attempt, a link or a runner. A boxxy fact carries one change, not the whole row, and
pepys prescribes scope mode for entities built from such delta facts. It owns these tables:

- `boxxy_items`, keyed by `id`, with the kind, repo, title, filed time and closed time.
- `boxxy_attempts`, keyed by `id`, with the item, phase, number, pool, recipe hash, rules version,
  state, failure, atc session, claimed time, started time and ended time.
- `boxxy_attempt_sessions`, keyed by `(attempt, agent_session)`, with the atc session and the seen
  time.
- `boxxy_pull_requests`, keyed by `(repo, number)`, with the attempt, item, linked time, merged time
  and merge commit.

For each scope, the consumer reads the entity's facts from pepys's fact index and rebuilds the
entity's rows, so the rows come out the same in any order the facts arrive. Each row also stores the
highest `storeVersion` among the facts it was built from, which a query can use as its observation
boundary.

**The query, `boxxy.costToLand`,** is registered in pepys's deployment catalog. It attaches the
`boxxy-work` file and the file of pepys's OTel consumer ([P1](#p1-claude-code-telemetry-as-facts))
read-only, as pepys's
[store design](https://github.com/zgeoff/pepys/blob/main/docs/design/pepys/store.md#reading-files)
allows for a query across consumer files.

- Input: `{ repo?: string; landedFrom?: string; landedTo?: string }`, with dates as ISO 8601.
- An item has landed when one of its PRs has `merged_at` set. Its landing time is the earliest such
  `merged_at`.
- Its cost is every `claude_code.api_request` record of every attempt of that item, failed and
  abandoned attempts included. A record belongs to an attempt when its `session.id` equals the
  `agent_session` of one of the attempt's `boxxy_attempt_sessions` rows, so an attempt's cost sums
  the records of all its agent sessions ([the session-id join](#the-session-id-join)).
- Output: one row per landed item and model: item id, title, repo, landed at, model, attempts,
  requests, input tokens, output tokens, cache read tokens, cache creation tokens, total input
  tokens, and cost in USD.
- Total input is `input_tokens + cache_read_tokens + cache_creation_tokens`.
- Cost is the sum of Claude Code's `cost_usd`, a list-price figure the agent computes, so the cost
  is modelled. Register the query with a description that says so.

## Commands and API

The server serves one oRPC router on Elysia, on `127.0.0.1` only, under `/rpc`. `@boxxy/contract`
holds its contract, and the CLI calls it through an oRPC client. In slice 1 the API checks no
caller identity. The actor recorded on a fact is `boxxy:owner:local` for CLI commands,
`boxxy:attempt:<attempt_id>` for the attempt procedures, and `boxxy:hook:<attempt_id>` for the hook
procedures ([facts and the outbox](#facts-and-the-outbox)).

| Procedure | CLI command | Does |
| --- | --- | --- |
| `item.file` | `boxxy item file --repo <repo> --title <text> --outcome <text> [--acceptance <text>]… [--blocked-by <item_id>]…` | files a `core.issue` with a `blocks` link from each `--blocked-by` item, and returns its id |
| `item.edit` | `boxxy item edit <item_id> [--title] [--outcome] [--acceptance <text>]…` | replaces the given fields |
| `item.get` | `boxxy item show <item_id>` | returns the item, its derived state, live levers, attempts, links, evidence and PRs |
| `item.list` | `boxxy item list [--state <state>] [--repo <repo>]` | returns items with their derived state and live levers |
| `item.close` | `boxxy item close <item_id> --reason <text>` | archives the item |
| `item.retry` | `boxxy item retry <item_id>` | writes an `item.retry` lever, which returns a `waiting` item to `ready` |
| `link.add` | `boxxy link add <source_id> blocks <target_id>` | adds a `blocks` link |
| `link.remove` | `boxxy link remove <source_id> blocks <target_id>` | removes a `blocks` link |
| `plan.defer` | `boxxy defer <item_id> [--until <time>] --reason <text>` | writes a `plan.defer` lever |
| `plan.undefer` | `boxxy undefer <item_id>` | writes a `plan.undefer` lever |
| `plan.expedite` | `boxxy expedite <item_id>… --reason <text> [--expires <time>]` | writes one `plan.expedite` lever per item, in the order given |
| `plan.unexpedite` | `boxxy unexpedite <item_id>` | writes a `plan.unexpedite` lever |
| `runner.status` | `boxxy status` | returns pools and slots, running attempts, the paused flag, the outbox lag, the latest outbox error and the latest rules rejection |
| `runner.pause` | `boxxy runner pause` | stops new claims |
| `runner.resume` | `boxxy runner resume` | restarts new claims |
| `attempt.current` | `boxxy attempt current` | returns the attempt for `ATC_SESSION_ID`, with its item and acceptance, or `no-live-attempt` |
| `attempt.evidence` | `boxxy attempt evidence --kind <kind> --ref <ref> [--observed <text>]` | records evidence, and prints its fact id |
| `attempt.closeOut` | `boxxy attempt close-out` (JSON on stdin) | parses and records the close-out, and prints every problem on failure |
| `evidence.recordPr` | `boxxy hook post-tool-use` (hook payload on stdin) | links a PR to the session's attempt |
| `attempt.current` | `boxxy hook pre-tool-use` (hook payload on stdin) | finds the session's attempt, then checks the trailer on `git commit` |
| none | `boxxy cost [--repo <repo>] [--since <date>] [--until <date>]` | prints pepys's `boxxy.costToLand` rows |

- `boxxy attempt evidence` takes `--kind` as `test`, `ci-run` or `live-check`. `--ref` is what the
  agent checked: a test file and test name, a CI run URL, or the URL or command of a live check.
  `--observed` holds what the agent saw, such as `42 passed` or an HTTP status, and goes into the
  evidence row's `observed` column.
- `boxxy cost` passes `--repo` as the query's `repo`, `--since` as `landedFrom`, and `--until` as
  `landedTo`. It reads pepys's address and token from the configuration file.
- Every time and date flag, such as `--until` and `--expires`, takes ISO 8601.
- Each command prints a table, and `--json` prints the procedure's output instead.
- A procedure given an item id that doesn't exist answers with the oRPC error `NOT_FOUND` and writes
  nothing.
- `@boxxy/server` ships the `boxxy-server` command, which starts the server with the configuration
  file.
- The `attempt.*` procedures find the attempt by `ATC_SESSION_ID`
  ([links](#links-to-commits-and-prs)) and write under its live generation, so the store refuses a
  call from a session whose attempt has settled.

### How an item gets in

An item gets in through `item.file`, from the CLI or from any oRPC client. The input needs a repo, a
title and an outcome; the acceptance list may be empty. `item.file` gives the criteria the ids `a1`,
`a2`, … in the order given, each with an empty `evidence` list. Each `--blocked-by` adds a `blocks`
link and writes one `boxxy.link.added`, in the same change as the item.

An item with acceptance starts `ready`, or `blocked` when `--blocked-by` lists an item not yet done.
An item with no acceptance starts as an `idea`, and `item.edit` with acceptance makes it `ready`.
Settle files the other items, from a close-out's `openItems`.

## Prerequisites outside boxxy

Slice 1 needs these changes in other repos. The units in [build order](#build-order) name the ones
they depend on. H1 blocks S1-01, and every other unit depends on S1-01, so H1 blocks every unit.

### pepys

#### P1: Claude Code telemetry as facts

boxxy needs pepys to ingest Claude Code's OpenTelemetry log records as facts. pepys's OTel consumer
projects each `claude_code.api_request` record into a table with the model, `cost_usd`, the token
counts, the `session.id` and the time. The cost query joins on the `session.id`.

The records reach pepys by push. pepys serves an OTLP/HTTP logs receiver on the private network,
and the local OTLP sink forwards each record to it as the record arrives. pepys reads no files from
the machine that runs the agents.

The P1 ticket in pepys settles the telemetry table's name and its column names and types. S1-12
writes the query against them, and needs them before it starts.

Each fact id is the event name, joined with one of these:

- the `request_id`, for an event that has one;
- the `tool_use_id`, for a tool result;
- the session id and the event sequence, for an event with neither.

A consumer drops a repeated fact id ([facts and the outbox](#facts-and-the-outbox)), so two
distinct events must never share one. A test delivers the same record twice and keeps one. It also
delivers a `claude_code.api_request` and a `claude_code.api_error` that share a `request_id`, and
keeps both.

#### P2: A fact-append route for boxxy

boxxy needs a pepys route that appends a batch of facts to `facts.boxxy.work`, with the fact ids
boxxy made. The route refuses streams other than `facts.boxxy.*`, needs a client with write scope,
and answers only once the batch is durable in the log.

The P2 ticket in pepys settles these, and S1-11 builds `@boxxy/facts-pepys` to them:

- the route's shape: its path, the request body, where the stream name goes, the largest batch, and
  the error format;
- which answers boxxy reads as `rejected`, and which as `unknown` for a resend;
- the wire form of the envelope's `at`;
- how the boxxy server gets a write-scope token through pepys's OAuth grant, and keeps it fresh.

#### P3: Deployment queries and the boxxy consumer

boxxy needs pepys's `createRouter` to accept a deployment's queries, and the deployment to register
the `boxxy-work` consumer and the `boxxy.costToLand` query.

The P3 ticket in pepys settles these, and S1-12 builds to them:

- the folder in the pepys repo that holds deployment code, where the consumer and the query go;
- how a query reads two consumer files at once;
- how a consumer reads a fact tagged by `type`, the field boxxy's envelope uses;
- how `@boxxy/facts-pepys` calls a deployment query, and with which token.

#### P4: pepys running live

boxxy needs pepys running live, with its log, host and API, and reachable from the machine boxxy
runs on.

### atc

#### A1: Agent session ids and telemetry config in atc

boxxy needs atc to record each agent's session id as `agentSessionID`, and to report it in the
spawn response or the session list. boxxy also needs per-agent telemetry config in atc that points
each agent at the local OTLP sink. A1 changes no atc protocol: `session.spawn` takes no telemetry
field. S1-09 depends on A1.

An investigation in atc settles both needs, and answers these open questions:

- whether subagent and advisor calls carry the main session's `session.id`;
- whether an agent's session id can change mid-session;
- whether Codex telemetry carries a session id that atc can record.

### hq

#### H1: A boxxy area in hq

boxxy needs hq to know the `boxxy` area and its repo, `zgeoff/boxxy`. hq picks the repo for a task
from the task's area, and hq's build flow dispatches the units below.

## Build order

Each unit is one PR or a short stack. "Depends on" lists units and prerequisites by id. The units
are listed in an order that builds. Each unit keeps its id, so S1-07 comes before S1-06.

### S1-01: Repo setup

- **Delivers:** the workspace, toolchain, CI, release and sync, copied from wringer as
  [tech stack](./tech-stack.md) lists:
  - Files:
    - the root `package.json`, with the catalog and the four workspace folders, `apps/`,
      `modules/`, `adapters/` and `libs/`;
    - `bunfig.toml` and the tsconfig;
    - the turbo boundaries config;
    - the oxlint config, with the import zones pins;
    - the oxfmt, lefthook, commitlint and knip configs;
    - the PR template, `CLAUDE.md` and the root README;
    - the release-please config, with one component per package;
    - `scripts/first-publish.sh`, which publishes one package's first version by hand.
  - Workflows:
    - `pr.yml`, with the checks, through repo-sync;
    - `main.yml`, which runs release-please and publishes every released package as
      `@boxxy/<folder>` through npm trusted publishing;
    - `npm-packages.yml`, which packs every package and dry-runs its publish on each PR.
  - Repo settings:
    - a ruleset on `main`.
- **Owner steps:** run `scripts/first-publish.sh <package>` once per package, in the `@boxxy` npm
  scope; add `main.yml` as the trusted publisher on npmjs.com; install the repo-sync App and set its
  secrets; allow auto-merge.
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
  - `@boxxy/model`, in `libs/model`, with every slice 1 type in the sketches that two or more
    packages share ([packages](#packages)):
    - the branded ids, the store rows, `Snapshot`, `StoreChange` and `ApplyResult`;
    - the port interfaces;
    - the plug-in interfaces, `Concept`, `Pool`, `LoadedRules` and the `define…` helpers;
    - `BuildCloseOut` and its zod schema;
    - the fact catalog, with a zod schema per fact type;
    - `deriveItemState`, `liveLevers` and `signalKey`.
  - `@boxxy/content-hash`, with:
    - the `ContentHash` type;
    - canonical JSON, by RFC 8785;
    - `hashTree` and SHA-256 hex hashes.
- **Depends on:** S1-01.
- **Acceptance:**
  - `derive-item-state.test.ts` covers each row of the derived state table, in its order, and an
    `item.retry` lever that returns a `waiting` item to `ready` (test).
  - `liveLevers` drops an undone lever and an expired one (test).
  - The same value with its object keys in another order hashes the same, and a changed value hashes
    differently (`content-hash.test.ts`).
  - Each fact type's schema accepts an example payload that the test invents, and rejects one with
    a missing field (test).

### S1-03: Rules loader and registry

- **Delivers:** `@boxxy/rules`: the `rules.yaml` schema and the loader. The loader takes the
  concepts and their pins as input, builds the plug-in kind registry, resolves each plug-in
  reference to its plug-in and parsed parameters, and computes the rules version.
- **Depends on:** S1-02.
- **Acceptance:**
  - The [example rules file](#rules-for-slice-1) loads (test).
  - Each rejection in the list under the example returns an error with the file, the path and the
    reason (one test per rejection).
  - A plug-in reference in a pool's `order` whose parameters the signal's `params` schema refuses
    fails with `bad-plugin-params` (test, with a test concept whose signal needs a number).
  - The rules version changes when one byte of the prompt template changes, and when a concept's
    pinned hash changes (test).

### S1-04: Planning

- **Delivers:** `@boxxy/planning`: `buildFrame` with its propagation step and filter-field values,
  `decide`, the concepts `pool@1`, `defer@1` and `expedite@1`, and the build step that generates the
  concept pins module.
- **Depends on:** S1-03.
- **Acceptance:**
  - A deferred item is held; an expedited deferred item is picked; a deferred item expires and is
    picked after its `until` (tests).
  - An expedited blocked item gives its blocker the `expedite` value, and the blocker is picked first
    (test).
  - An item with two live expedites sorts by its oldest one, and a `plan.undefer` ends a defer's hold,
    with the snapshot's levers built by `liveLevers` (tests).
  - A pool takes only the candidates whose filter-field values in the frame match its `takes`
    (test).
  - The generated pins module changes when one byte of a concept's source changes (test).
  - A gate that throws holds its item with the fault as its reason, a waiver that throws lifts
    nothing, a signal that throws gives no opinion, and a propagation line that throws carries
    nothing (one test each).
  - `decide` returns the same picks for the same frame across 100 runs under `--randomize` (test).
  - `decide.ts` never imports a file under `src/concepts/` (lint or test).

### S1-05: The store

- **Delivers:** `@boxxy/store-sqlite` (schema, migrations, `ClaimStore`), and the `ClaimStore`
  memory fake and contract test suite in `@boxxy/dispatch`. The port's types come from
  `@boxxy/model`.
- **Depends on:** S1-02.
- **Acceptance:**
  - The contract suite passes against the fake and against SQLite in a temporary file (test).
  - The partial unique index refuses a second live item-phase lease on one item phase, and
    `applyChange` returns `lease-held` (test).
  - With every slot of a pool held, a claim changes no row, and `applyChange` returns `no-free-slot`
    (test).
  - A settle whose `under` names an old slot `gen` releases nothing, and `applyChange` returns
    `stale-generation` (test).
  - The store refuses a change under a stale generation whole: it writes no row and no outbox fact
    (test).
  - An update whose `expect` doesn't match its row writes nothing, and `applyChange` returns
    `guard-mismatch` (test).
  - A claim's change gets the slot and slot `gen` the store took, in the attempt row and the claimed
    fact, and a lever insert gets its `seq` (test).
  - `findAttemptByAgentSession` returns the attempt that holds an agent session id, and `null` for
    an unknown one. The unique index refuses a second attempt's row for the same agent session id
    (test).
  - Two `exclusive` calls started together run one at a time. A `work` that throws leaves the state
    as it was, and a `read` during a running `exclusive` call sees the last committed state
    (contract suite, against the fake and SQLite).
  - Loading rules with a smaller pool, or without a pool, retires the extra slot rows and deletes
    none. A retired row keeps its holder, and a pool that grows again reuses the row with its `gen`
    (test).
  - Migrations run on an empty file and again on a migrated file with no change (test).

### S1-07: Close-out

- **Delivers:** `@boxxy/closeout`: the parser with every rejection in
  [the build close-out](#the-build-close-out), the criteria check, and the `openItems` dedupe. The
  `BuildCloseOut` type and its zod schema come from `@boxxy/model`.
- **Depends on:** S1-02.
- **Acceptance:**
  - Each rejection has a test, and one close-out with three problems returns all three (tests).
  - `dedupeOpenItems` puts an entry whose title matches an open `core.issue`, after normalising, in
    `matched`, and the rest in `file` (test).
  - A friction entry with an unknown target kind fails the parse (test).
  - A friction entry with no target is dropped and counted in `frictionDropped` (test).

### S1-06: claimNext and settle

- **Delivers:** `claimNext`, `startClaim`, `bindSession` and `settleAttempt` in `@boxxy/dispatch`,
  and a benchmark script in `scripts/` that runs `claimNext` on the real store. `scripts/` is repo
  tooling, so the script may import any workspace package.
- **Depends on:** S1-04, S1-05, S1-07. Settle uses the `openItems` dedupe and `BuildCloseOut` from
  S1-07.
- **Acceptance:**
  - Two `claimNext` calls on two connections to one file, started together 200 times with one free
    slot, never claim the same item phase and never exceed the slot count (test).
  - A claim writes the attempt, the item-phase lease, the slot lease, the decision row and both
    outbox facts, or none of them when a step throws (test).
  - When `applyChange` returns `lease-held` or `no-free-slot`, `claimNext` throws, the store keeps no
    decision row, and the runner logs the throw and ends that tick's claim loop (test).
  - Settle releases the item-phase lease and the slot lease and writes `boxxy.attempt.settled` in one
    transaction (test).
  - A settle with the forced reason `session-lost` fails the attempt even with a `built` close-out,
    and still files the close-out's `openItems` (test).
  - An `openItems` entry that matches an open `core.issue` files no item, and the settled fact lists
    the matched item (test).
  - The benchmark at 5,000 open items reports lock p99 under 50 ms (the script's output in the PR).

### S1-08: Server, contract and CLI

- **Delivers:** `@boxxy/contract`, the commands' logic in `@boxxy/dispatch`, `@boxxy/server`
  (Elysia, the oRPC router, configuration) and `@boxxy/cli` with every command in
  [the table](#commands-and-api) except `boxxy cost`, `boxxy attempt current` and the hook commands.
  The server reloads the rules on its own 5-second timer until S1-09 moves the reload into the tick.
- **Depends on:** S1-06, S1-07.
- **Acceptance:**
  - An e2e test starts the server on a temporary store, files two items with the CLI, links one as
    blocking the other, defers one, expedites one, and reads the expected derived states and levers
    back with `boxxy item list` (end-to-end test).
  - `item.file` with three criteria and one `--blocked-by` gives the ids `a1`, `a2` and `a3`, and
    writes one `boxxy.link.added` in the same change as the item (test).
  - The server refuses to bind to an address other than `127.0.0.1` (test).
  - A rules commit that fails to load leaves the previous rules version live, and `boxxy status`
    shows the rejection (test).

### S1-09: The atc worker and the runner loop

- **Delivers:** `@boxxy/worker-atc` (spawn, and reconcile by session name), the reconcile table,
  `createFakeWorker()` and the `WorkerKind` contract suite in `@boxxy/dispatch`, the runner loop in
  `@boxxy/server` with the `attempt_sessions` writes
  ([agent sessions](#agent-sessions)), and the example rules checkout with a minimal
  `prompts/build-v1.md` that uses every [template value](#rules-for-slice-1).
- **Depends on:** S1-08, A1.
- **Acceptance:**
  - The `WorkerKind` contract suite passes against the fake and against `worker-atc` with atc's
    client mocked at its oRPC boundary (test).
  - A `running` reading that carries a new `agentSessionID` writes an `attempt_sessions` row and
    `boxxy.attempt.session_bound` in one change, both on an attempt that started without it and on
    one in `reconciling` (test).
  - A second agent session on one attempt, such as after a respawn, writes a second row, and a
    repeated reading of a known pair writes nothing (test).
  - A reading whose agent session id belongs to another attempt writes no row and no
    `session_bound` fact, the runner logs a fault, and the rest of the change, such as a settle,
    lands (test).
  - An `unknown` start moves the attempt to `reconciling`, and a later reading of its session moves
    it to `running` (test).
  - A session in a state the adapter doesn't know reads as `running`, and the adapter logs a warning
    (test).
  - An `absent` reading for an attempt in `running` settles it as `failed` with reason
    `session-lost`, and releases the item-phase lease and the slot lease (test).
  - An `absent` reading for an attempt in `starting` sends the stored spawn request again (test).
  - A server restart with an attempt in `running` reconciles it before the first claim (test).
  - `boxxy runner pause` stops claims: with the runner paused, a ready item stays ready across 3
    ticks (test with the fake worker).
  - A live attempt on a scratch repo starts through atc, and its `claude_code.api_request` records
    in the local OTLP sink carry a `session.id` equal to an `agent_session` in the attempt's
    `attempt_sessions` rows (live check, record lines and the rows quoted in the PR).

### S1-10: Commit and PR links

- **Delivers:** the Claude Code plugin in `apps/cli/plugin/`, the hook commands, `attempt.current`
  and `boxxy attempt current`, `evidence.recordPr`, `@boxxy/forge-github`, `createFakeForge()` and
  the `Forge` contract suite in `@boxxy/dispatch`, and the PR watch.
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

- **Delivers:** `@boxxy/facts-pepys` (`FactSink` over P2), `createFakeFactSink()` and the `FactSink`
  contract suite in `@boxxy/dispatch`, and the outbox sender. The sender joins the runner's tick,
  as step 4.
- **Depends on:** S1-08, P2, P4.
- **Acceptance:**
  - The `FactSink` contract suite passes against the fake and against the adapter with pepys's
    route mocked (test).
  - An `unknown` append resends the same fact ids, and the fake sink keeps one copy of each id
    (test).
  - With the sink failing, claims and settles go on and `boxxy status` shows the outbox lag (test).
  - A `rejected` append stops the sender, keeps the rows unsent, and `boxxy status` shows pepys's
    error (test).
  - Facts from a live boxxy server appear in pepys's `facts.boxxy.work` stream (live check).

### S1-12: Cost to land

- **Delivers:** the `boxxy-work` consumer and the `boxxy.costToLand` query in the pepys repo, the
  cost reader in `@boxxy/facts-pepys`, and `boxxy cost`.
- **Depends on:** S1-11, P1, P3, P4.
- **Acceptance:**
  - The consumer's golden-fact test feeds a fixture of boxxy facts in two orders, and with one fact
    sent twice, and gets the same rows (pepys test).
  - The query's golden test returns one row per item and model, counts a failed attempt's requests,
    leaves out a request whose `session.id` matches no attempt, sums the requests of an attempt with
    two agent sessions into its item's row, and sums total input with both cache counts (pepys
    test).
  - `boxxy cost` prints the rows from a live pepys (live check).

### S1-13: The trial on pepys

- **Delivers:** the trial: the private rules repo `zgeoff/boxxy-rules`, which this unit creates,
  with the slice 1 rules and a tuned `prompts/build-v1.md`; the server running on the owner's
  machine; and real pepys work filed in boxxy. The rules repo's own PR holds the rules and the
  prompt. The boxxy PR holds any doc fixes, and its description names the rules repo.
- **Spend stays private.** `boxxy cost` output and every spend figure from the trial go in the
  tracker ticket only, never in this public repo or a PR description.
- **Depends on:** S1-10, S1-12.
- **Acceptance:**
  - One item goes from `item.file` through a build attempt, a PR, the repo's review gate and a
    merge to `done`, and `boxxy cost` shows its rows with the model (live check; the output goes in
    the tracker ticket).
  - With the boxxy server stopped, a pepys PR outside boxxy is opened, reviewed and merged with no
    boxxy error in its session or its checks (live check).
  - Every merged PR from a boxxy attempt has a `pr_linked` fact and at least one `commit_linked`
    fact (live check: a query over the store).
