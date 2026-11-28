# The store

The boxxy store is one SQLite file that only the server opens. [The data](../overview.md#the-data)
says what it holds and why claims live in it, and [Terms](../overview.md#terms) defines attempt,
claim, lever, limit, seat and fact. This doc covers how a write lands, what refuses one, and the
settings the store runs under.

## One change at a time

A change is one set of row writes and the facts they record, such as a claim or a settle. The server
writes each change through `applyChange`, inside a call to `exclusive`, which holds the store's one
write transaction. `exclusive` runs its calls one after another.

`applyChange` works through the change in this order: its `under` guard, which names the item phase
and lease generation the change writes under; then the seats it takes; then the rows, where each
update can guard on the row's values; then the facts. When a check fails, `applyChange` returns a
refusal and rolls that change back to a savepoint. The earlier changes in the same `exclusive` call
stay.

| Refusal            | Cause                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| `stale-generation` | the lease that `under` names is no longer live at that generation       |
| `lease-held`       | another attempt holds the lease, the right to run that item's phase     |
| `guard-mismatch`   | a row an update guards on no longer holds the values the update expects |
| `limit-full`       | a limit that counts the attempt has no free seat                        |
| `unknown-limit`    | the change names a limit that the loaded rules no longer hold           |

A write that breaks a unique index throws in place of a refusal, and the whole transaction rolls
back, the earlier changes included.

Each lease has a generation, one more than the highest generation of that item's phase, and every
later write about the attempt names it in `under`. A new lever's row carries `seq` 0, and
`applyChange` writes the lever's real place in the store's order into the row and into its
`lever.recorded` fact.

Some writes skip `applyChange`, record no fact and leave the store's version number as it was: the
outbox sender marking a fact sent or setting it aside as rejected, the runner's heartbeat, the time
of the last pull request check, and the notice writes.

## Short references

Each item row has a `ref` column, an integer that the store gives the item when it files it: the
insert of an `items` row writes `coalesce(max(ref), 0) + 1` in the same statement, under the write
lock, so two items filed in the same moment never share a number. A caller's row for an insert has
no `ref`, and both ways of filing an item, the `item.file` handler and the triage `file-item`
effect, get the number from that insert. A closed item keeps its number, so no number is given
twice. A unique index covers the column. Migration `0014-item-ref` added the column in place and
numbered the stored items from 1 in the order of `filed_at`, then `id`.

A read returns the number as `i-<n>` in the row's `ref`, and a row with no number fails the read. No
fact carries `ref`: it is the store's own numbering, and the item ID names the item in every fact.
[Naming an item](../interfaces/api-and-auth.md#naming-an-item) covers how a caller uses it.

## Evidence refs

The `evidence` table's unique key is the attempt, the kind and the ref. A `check` or `verdict` row
also holds the head the server read, and the same check at a new head is a new row. A rebuild of the
table is not allowed, and an extra index cannot loosen the table's own constraint. So the store
writes a checked row's `ref` as `<name>@<head>`, and `parseStoreRow` strips the head on every read.
A tool that opens the SQLite file directly, such as a SQL console on a backup, sees the qualified
ref. Every other evidence kind stores its bare ref.

## Capacity refusals

The `capacity_refusals` table holds one row for each spawn that atc refused for capacity: its own
ID, the ID of the attempt the spawn was for, the item, the phase, the pool, the time, and atc's
refusal as JSON. The attempt row is gone, so the attempt ID names no stored row. The row is written
in the change that deletes the attempt ([the refusal](./attempts.md#a-spawn-refused-for-capacity)),
and nothing else reads the table but `runner.status`. Migration `0016-capacity-refusals` created it,
moved each attempt stored with the failure `no-capacity` into it under the attempt's ID, and deleted
those attempts with their leases, seats, sessions and decisions.

## Claims

A claim that `applyChange` refuses leaves no decision row. `claimNext` writes the planning decision
and the claim in one transaction, and throws `ClaimRaceError` on a refusal, so the decision rolls
back with the claim. The runner logs the error and stops claiming until its next tick. A paused
runner returns before it reads anything, and a decision that picks nothing writes nothing.

The claim holds the store's write lock for its whole transaction, from `BEGIN IMMEDIATE` to the
commit. The claim benchmark, `claim-next.bench.ts` in `adapters/store-sqlite/bench/`, sets the limit
on that lock time.

## SQLite settings

The store runs SQLite in WAL mode, with `synchronous=NORMAL` and `temp_store=MEMORY`, and its tables
are STRICT. bun:sqlite waits on a busy lock synchronously and would stall every other store in the
process. So when `BEGIN IMMEDIATE` finds the database busy, the store sleeps and tries again until
the time limit in `with-busy-retry.ts` passes, then rejects. The store retries on every
`SQLITE_BUSY` code, and retries the switch to WAL mode the same way.

Migrations run in one `BEGIN IMMEDIATE` transaction. A read opens its own handle, which reads one
snapshot and never creates the database file. Closing the store waits for the calls that are
running, and any call after that rejects.
