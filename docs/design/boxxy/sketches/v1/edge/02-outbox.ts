// Design sketch. It is not compiled.
//
// 02-outbox.ts: the fact outbox of boxxy v1 and its sink.
//
//   A. The call sites: the server start, a test with the fake.
//   B. The outbox table, the write rule, and how boxxy bounds a payload.
//   C. The port `FactSink`, its two adapters, and "no pepys".
//   D. The sender loop: the batch, the order, the event ID, each answer, the backoff.
//   E. What the owner sees, and a day with pepys down.
//   F. What boxxy reads back from pepys, and what it never reads.
//
// The build changes: docs/design/boxxy/slice-1.md "Facts and the outbox", "`outbox`" and "The
// pepys adapter"; `FactSink`, `CostReader` and `readUnsentFacts` in
// libs/model/src/ports/types.ts; `OutboxFact` in libs/model/src/facts/types.ts; the
// create-tables migration of adapters/store-sqlite.
// The fact types and the envelope are the core's (../core/04-facts.ts, section A).
// The wire format, the signature and the ingest answers are those of the pepys kit, the public
// package `@pepys/kit`: its exports `createFactBatchSender`, `OutgoingFact`, `receiveFactBatch`
// and `handleReceiveRoute`. "The kit" in this file means that package.
//
// What the build changes in the existing code:
//   - `FactSink`: rename `append(facts)` to `send(facts)`, and change its answer from
//     `'accepted' | { kind: 'unknown' } | { kind: 'rejected' }` to `SinkAnswer` (section C).
//   - Fact IDs: change the form `manual:<uuidv7>` to a bare UUID version 7 (section B).
//   - `OutboxFact` and the table `outbox`: add `parkedAt` (`parked_at`) and `parkedReason`
//     (`parked_reason`), and narrow `entity` (section B). Add the index `outbox_behind`, and
//     add `AND parked_at IS NULL` to the index `outbox_unsent`.
//   - The store: add `parkFacts`, `unparkFacts`, `readOutboxCounts` and `readItemBehind`
//     (section B).
//   - Remove the port `CostReader`; the port is `PepysReader` (section F).
//   - Name the pepys adapter package `@boxxy/pepys`. The older design documents call it
//     `@boxxy/facts-pepys`.

import type { ActorRef, ClaimStore, Clock, FactId, FactType, Instant, ItemId, JsonValue, Minutes } from '@boxxy/model';
import { createFactBatchSender } from '@pepys/kit/send';
import { boxxySource } from '@boxxy/pepys'; // the boxxy pepys package: the source, the consumer, the query

// ── A. The call sites ──────────────────────────────────────────────────────────────────────────

// A1. apps/server/src/start-server.ts. The sink comes from the configuration file. With no
// `pepys` section the sink is null and no sender runs.
// `environment` is the environment whose deploy counts in the stage times (such as
// `production`); `createPepysReader` takes it (section F).
declare const config: { pepys: { ingestUrl: string; apiOrigin: string; environment: string } | null };
declare const store: ClaimStore;
declare const clock: Clock;

const sink = config.pepys === null ? null : createPepysFactSink({ url: config.pepys.ingestUrl, secret: process.env.BOXXY_PEPYS_SIGNING_SECRET ?? '' });
const sender = startOutboxSender({ store, sink, clock, limits: outboxLimits });

// The store calls this after each applied change, so a new fact leaves within one loop turn.
sender.nudge();

// A2. modules/dispatch/src/outbox.test.ts. The fake keeps one copy per fact ID and plays answers.
const fake = createFakeFactSink();
fake.answerNext({ kind: 'retry', reason: 'connection refused' }, { kind: 'stored' });
await runSenderOnce({ store, sink: fake, clock, limits: outboxLimits }); // sends the batch, gets `retry`
await runSenderOnce({ store, sink: fake, clock, limits: outboxLimits }); // sends the SAME rows, gets `stored`
// fake.sends[0] and fake.sends[1] hold the same fact IDs; fake.facts holds each fact once.

// ── B. The table, the write rule, the bound ────────────────────────────────────────────────────
//
// Table `outbox` (adapters/store-sqlite/src/migrations/create-tables-migration.ts). The build adds the two
// columns `parked_at` and `parked_reason`.
//
//   column          holds                                                             null
//   ──────────────  ────────────────────────────────────────────────────────────────  ────
//   seq             INTEGER PRIMARY KEY AUTOINCREMENT: the order, and the store        no
//                   version that the change made
//   fact_id         a UUID version 7, UNIQUE. The event ID on the wire. The fact ID    no
//                   in pepys is `event:boxxy:<fact_id>`
//   type            the fact type, one of the 27 of core `WorkFacts`                   no
//   entity          `boxxy:item:<item_id>`, for every row (the core's entity rule)     no
//   actor           `boxxy:owner:local`, `boxxy:runner:<id>`, `boxxy:attempt:<id>`     no
//                   or `boxxy:hook:<id>`
//   at              the change's `at`, epoch milliseconds                              no
//   payload         the fact payload as JSON, with no `storeVersion`                   no
//   sent_at         when the sink answered `stored` for the row                        yes
//   parked_at       when the sender gave the row up                                    yes
//   parked_reason   `too-large`, `unknown-type`, or the sink's refusal text            yes
//
//   index  outbox_unsent   (seq)     WHERE sent_at IS NULL AND parked_at IS NULL
//   index  outbox_behind   (entity)  WHERE sent_at IS NULL        -- `behind` of the two reports
//
// The write rule (docs/decisions/0013-one-write-path-per-fact.md). `StoreTx.applyChange` is the
// only code that inserts an outbox row. It writes every row of a `StoreChange` and every fact
// of that change in one transaction, or none. The caller that built the change made each
// `fact_id` (`newId()`) and the `at`; the store makes no ID and reads no clock. No code path
// writes a fact row later, from a state row, or from the sender. So a state that exists in the
// store has its fact in the outbox, and a fact in the outbox has its state.
//
// The sender writes bookkeeping only, outside `StoreChange`, with no fact and no store version:
// `markFactsSent`, `parkFacts`, `unparkFacts`.
//
// How boxxy bounds a payload. Three layers, and no store change is ever refused for its size:
//   1. At the API. Every string and list of a command input has a `max` (01-api.ts, rule 5), and
//      the route refuses a body over 256 KiB. A close-out is one such body.
//      That limit does NOT bound the close-out's fact. The body limit and `factBytes` are the
//      same number (262,144), the fact adds a wrapper of 466 bytes, and the stored JSON can be
//      longer than the sent JSON (`1e20` is stored as 21 bytes).
//   2. At the parser. Each phase kind's close-out parser caps its lists: it keeps the first
//      entries of `friction` and counts the rest in `frictionDropped`. The same rule goes for
//      a review's findings and a build's open items.
//      The parser also has two byte limits (core `closeOutLimits`). The review parser keeps
//      the counts of noslop's raw result, and the result itself only when it is 32,768 bytes
//      or under. `closeOutAttempt` then measures the close-out as stored, and one over 120,000
//      bytes is `rejected` as `too-large` with no write, so the agent sends a shorter one. A
//      close-out fact is thus 120,000 + 466 bytes at most, under half of `factBytes`. It is a
//      refusal of the COMMAND, before any change exists, so the rule holds that no store
//      change is refused for its size.
//   3. At the sender, as the backstop. A row whose wire item is over `factBytes` is parked as
//      `too-large` and never sent. The change that made it is applied and is not undone:
//      dispatch does not depend on what pepys can hold.
//      `outbox.retry` does not help such a row: its size is the same on every try. No accepted
//      close-out can be such a row. A fact of another type that has no bound of its own can:
//      `boxxy.decision.recorded` carries the whole `DecisionRow`.
//      Not checked: the size of the largest real fact. `boxxy.decision.recorded` is not
//      measured at 5,000 open items. If it passes 256 KiB, the sender parks it.

export interface OutboxLimits {
  // ingest stores 100 facts of one batch at most (kit `factLimit`)
  readonly batchFacts: 100;

  // One fact on the wire: the UTF-8 bytes of its JSON as the kit's `OutgoingFact`. 256 KiB.
  readonly factBytes: 262_144;

  // One batch: the sum over its facts of (wire bytes + `envelopeBytes` + 8). 900,000.
  // Why under 1 MiB: every boxxy fact is on ONE stream, so a batch is ONE S2 append, and one
  // append holds 1,048,576 metered bytes. The same number is ingest's default limit of the
  // request body. The rest is margin for the third limit: S2's JSON request of about 2 MiB,
  // which a body made mostly of quotes reaches at 1 MiB.
  readonly batchBytes: 900_000;

  // What the stored envelope adds to a wire item: `id`, `v`, `api`.
  // Assumed: 512 bytes. It is an allowance, not a measure. To measure it, store one fact and
  // compare the sizes.
  readonly envelopeBytes: 512;

  readonly requestTimeoutMs: 10_000;
  readonly backoff: { readonly firstMs: 1_000; readonly factor: 2; readonly maxMs: 300_000; readonly jitter: 0.2 };
  readonly blockedRetryMs: 300_000;

  // this many rows parked in a row, with none stored between, reads as "pepys refuses everything"
  readonly parkRun: 25;
}
export declare const outboxLimits: OutboxLimits;

// libs/model/src/facts/types.ts. The build narrows `entity` and adds `parkedAt` and
// `parkedReason`.
export interface OutboxFact {
  readonly seq: number;
  readonly factId: FactId; // a bare UUID version 7
  readonly type: FactType;
  readonly entity: `boxxy:item:${string}`;
  readonly actor: ActorRef;
  readonly at: Instant;
  readonly payload: JsonValue;
  readonly sentAt: Instant | null;
  readonly parkedAt: Instant | null;
  readonly parkedReason: string | null;
}

// libs/model/src/ports/types.ts, the outbox part of the store.
export interface OutboxReader {
  // oldest first; rows with `sent_at` and `parked_at` both null
  readUnsentFacts: (limit: number) => Promise<OutboxFact[]>;
  readOutboxCounts: () => Promise<{ unsent: number; parked: number; oldestUnsentAt: Instant | null }>;
  readItemBehind: (item: ItemId) => Promise<{ facts: number; oldestAt: Instant | null }>;
}
export interface OutboxBookkeeping {
  markFactsSent: (ids: readonly FactId[], at: Instant) => Promise<void>;
  parkFacts: (ids: readonly FactId[], reason: string, at: Instant) => Promise<void>; // the build adds it
  unparkFacts: () => Promise<number>; // the build adds it; `outbox.retry` calls it
}

// ── C. The port and its adapters ───────────────────────────────────────────────────────────────
//
// A port, because a second adapter exists (the fake) and every sender test needs it.
// The build renames `append(facts)` of the existing `FactSink` to `send(facts)`, with the
// answer `SinkAnswer`.

export interface FactSink {
  // Sends the rows as ONE batch, in the order given. It never splits and never reorders.
  send: (facts: readonly OutboxFact[]) => Promise<SinkAnswer>;
}

export type SinkAnswer =
  // 200: every fact of the batch is durable in the log
  | { readonly kind: 'stored' }
  // ANY 5xx answer (not 503 alone), a timeout, or no connection: the batch may be stored or
  // not. Send it again, with the same rows. The kit's sender answers `retry` for each of these.
  | { readonly kind: 'retry'; readonly reason: string }
  // 400, 413 or 422: pepys read the batch and refuses its content. A repeat gets the same answer.
  | { readonly kind: 'refused-batch'; readonly status: 400 | 413 | 422; readonly reason: string }
  // 401, 404, 405 and any other answer: the sink itself is set up wrong. No batch can pass.
  | { readonly kind: 'refused-sink'; readonly status: number; readonly reason: string };

// C1. The pepys adapter: packages/pepys/src/create-pepys-fact-sink.ts in the boxxy repo, package
// `@boxxy/pepys`. It holds no HTTP code: the kit's sender builds the
// body, signs it as the `check` of `boxxySource` says (HMAC-SHA256 of the raw body, in the header
// `x-boxxy-signature-256`), and posts it.
export function createPepysFactSink(options: { url: string; secret: string }): FactSink {
  const sendBatch = createFactBatchSender({ source: boxxySource, url: options.url, secret: options.secret });

  return {
    send: async (facts) => {
      // The kit's sender takes no abort signal, so the adapter races it with a timer. A late
      // answer is dropped; the row stays unsent and is sent again.
      const sent = await withTimeout(sendBatch(facts.map(toWireItem)), outboxLimits.requestTimeoutMs);

      if (sent === 'timeout') return { kind: 'retry', reason: 'no answer in 10 seconds' };
      if (sent.ok) return { kind: 'stored' };
      if (sent.failure.kind === 'retry') return { kind: 'retry', reason: sent.failure.reason };

      const { status, reason } = sent.failure;

      return status === 400 || status === 413 || status === 422 ? { kind: 'refused-batch', status, reason } : { kind: 'refused-sink', status, reason };
    },
  };
}

// One outbox row as the kit's `OutgoingFact`.
// The fact ID in pepys is `event:boxxy:<event>`; `event` is a bare UUID version 7.
// `storeVersion` is added HERE and nowhere else. The outbox row and the model's schema hold
// the payload without it; the wire schema in `@boxxy/pepys` has it.
export function toWireItem(fact: OutboxFact) {
  return {
    type: fact.type,
    event: fact.factId, // the same value on every send of the row: this makes a repeat harmless
    entity: fact.entity,
    actor: fact.actor,
    at: new Date(fact.at).toISOString(),
    payload: { ...(fact.payload as Record<string, JsonValue>), storeVersion: fact.seq },
  } as Parameters<ReturnType<typeof createFactBatchSender<typeof boxxySource>>>[0][number];
}

// C2. The fake: modules/dispatch/src/test-utils/create-fake-fact-sink.ts.
export interface FakeFactSink extends FactSink {
  readonly sends: readonly (readonly FactId[])[]; // every call, in order
  readonly facts: ReadonlyMap<FactId, OutboxFact>; // one copy per ID, as a pepys consumer keeps
  answerNext: (...answers: SinkAnswer[]) => void; // then `stored` again
  refuseFact: (id: FactId, status: 413 | 422) => void; // any batch that holds it is refused
}
export declare function createFakeFactSink(): FakeFactSink;

// One suite, run against the fake and against the pepys adapter with ingest's route handler
// (the kit's `handleReceiveRoute` over an in-memory log) behind it.
export declare function factSinkContract(make: () => Promise<{ sink: FactSink; readStored: () => Promise<FactId[]> }>): void;

// C3. No pepys at all. The sink is null: `startOutboxSender` starts no loop. Every change still
// writes its outbox rows, because the row's `seq` is the store version and `fact_id` is the ID
// that a close-out cites. The rows wait, unsent. When the owner adds pepys, the sender sends
// the whole history from `seq` 1. No third adapter marks rows as sent.

// ── D. The sender loop ─────────────────────────────────────────────────────────────────────────
//
// apps/server/src/run-outbox-sender.ts. Its own loop, not step 4 of the runner tick (where
// docs/design/boxxy/slice-1.md has it): a send can wait 10 seconds, and a tick must not.

export interface OutboxSender {
  nudge: () => void; // a change was applied, or `outbox.retry` ran
  status: () => OutboxStatus;
  stop: () => Promise<void>;
}
export declare function startOutboxSender(deps: SenderDeps & { sink: FactSink | null }): OutboxSender;
export declare function runSenderOnce(deps: SenderDeps & { sink: FactSink }): Promise<SenderStep>;

interface SenderDeps {
  readonly store: ClaimStore;
  readonly clock: Clock;
  readonly limits: OutboxLimits;
}

export type SenderStep = 'idle' | 'stored' | 'retry' | 'parked' | 'blocked';

// Pure. The batch is the longest prefix of the unsent rows, in `seq` order, that holds 100 facts
// or fewer and stays inside `batchBytes`. A first row over `factBytes` is returned alone as
// `oversize`. Because `factBytes` + 520 is under `batchBytes`, a batch is never empty.
export declare function takeBatch(rows: readonly OutboxFact[], limits: OutboxLimits): { kind: 'batch'; facts: readonly OutboxFact[] } | { kind: 'oversize'; fact: OutboxFact };

// One turn. `held` is the batch that got `retry`; it lives in memory only.
async function turn(deps: SenderDeps & { sink: FactSink }, held: readonly OutboxFact[] | null): Promise<SenderStep> {
  // 1. The batch. After a `retry` it is the SAME rows, so pepys sees the same batch again.
  const taken = held === null ? takeBatch(await readUnsent(deps, 100), deps.limits) : { kind: 'batch' as const, facts: held };

  if (taken.kind === 'oversize') {
    await park(deps, [taken.fact], 'too-large');

    return 'parked';
  }

  if (taken.facts.length === 0) return 'idle'; // wait for a nudge, or 5 seconds

  // 2. One batch is in flight at a time, so the stream gets the facts in `seq` order.
  return settle(deps, taken.facts, await deps.sink.send(taken.facts));
}

// What each ingest answer makes the sender do.
//
//   answer                 SinkAnswer      the sender
//   ─────────────────────  ──────────────  ───────────────────────────────────────────────────────
//   200                    stored          `markFactsSent` for the batch. Backoff resets. Next
//                                          batch at once, until no row is left.
//   any 5xx, timeout,      retry           Keeps the batch as `held`. Waits 1 s, 2 s, 4 s … up
//   no connection                          to 5 min, each ±20%. Sends the same rows with the
//                                          same event IDs. Marks nothing. Never gives up.
//   413, batch of N > 1    refused-batch   The budget was wrong for this batch. Splits it in two
//                                          halves and sends each. No wait.
//   413, batch of 1        refused-batch   Parks the row as `too-large`.
//   400 or 422, N > 1      refused-batch   One fact of the batch is not valid, and ingest refuses
//                                          the whole batch. Splits in halves to find it: about
//                                          14 sends more for one bad fact in a batch of 100.
//   400 or 422, N = 1      refused-batch   Parks the row with pepys's reason. Goes on.
//   401, 404, 405, other   refused-sink    The secret, the URL or the deployment is wrong. Parks
//                                          nothing. State `blocked`. Tries the same batch again
//                                          every 5 min, because the fix can be on the pepys side.
//
// After `parkRun` (25) rows parked in a row with none stored between, the sender stops parking
// and goes to `blocked` with the reason "pepys refuses every fact". That is version skew between
// the boxxy server and the boxxy pepys package in the pepys deployment, not 25 bad facts.
// `boxxy outbox retry` clears every park mark after the fix, and the rows go out in `seq` order.
declare function settle(deps: SenderDeps, batch: readonly OutboxFact[], answer: SinkAnswer): Promise<SenderStep>;

// Order. Rows leave in `seq` order, and one stream holds them in that order, with three known
// exceptions: a repeat after a lost 200 puts a batch in twice; a parked row that is sent later
// lands after newer rows; a split sends its halves in order but as two appends. None of them
// changes a pepys row: `boxxy_work` rebuilds an item's scope from all its facts in any arrival
// order and drops a copy by its fact ID (the kit's scope consumer).
// The same holds for a batch that someone captured and sends again at a later time. Its fact
// IDs are in the signed body, so every fact is a copy: the scope index of pepys keeps the
// first copy of a fact ID, and no row or link changes. pepys's ingest also drops a body it
// stored in the last hour. A replay after that hour only adds copies to the log.
//
// A restart loses `held`. The next turn builds the batch again from the unsent rows. It can hold
// more rows than the batch that got `retry`. That is safe here and only here: one stream means
// one append, so the first try stored all of its facts or none, and a copy is dropped by ID.
//
// The event ID. `fact_id` is made once, by the caller that built the change, and stored in the
// transaction of that change. Every send of the row carries it as `event`. Two changes never
// share one. So "send again" needs no memory of what pepys holds.

declare function readUnsent(deps: SenderDeps, limit: number): Promise<OutboxFact[]>;
declare function park(deps: SenderDeps, facts: readonly OutboxFact[], reason: string): Promise<void>;
declare function withTimeout<Value>(promise: Promise<Value>, ms: number): Promise<Value | 'timeout'>;

// ── E. What the owner sees ─────────────────────────────────────────────────────────────────────

// In `runner.status` (the tool `runner_status`, and `boxxy status`).
export interface OutboxStatus {
  readonly sink: 'pepys' | 'none';
  readonly state: 'idle' | 'sending' | 'backing-off' | 'blocked' | 'off';
  readonly unsent: number;
  readonly parked: number;
  readonly lag: Minutes | null; // the age of the oldest unsent row; null when none
  readonly failingSince: Instant | null; // the first answer that was not `stored`, since the last `stored`
  readonly nextTryAt: Instant | null;
  readonly lastError: { readonly kind: 'retry' | 'refused-batch' | 'refused-sink'; readonly status: number | null; readonly message: string; readonly at: Instant } | null;
  readonly lastStoredAt: Instant | null;
}

// A day with pepys down, as `boxxy status` prints it (invented numbers):
//
//   outbox   backing-off   6,240 unsent   0 parked   lag 24 h 03 min
//            failing since 2026-11-10 09:12   next try in 4 min
//            last error: retry: connection refused (2026-11-11 09:11)
//
//   - Dispatch does not change. Claims, close-outs and settles read and write the store only.
//   - The outbox grows by one row per fact. Nothing is dropped and nothing is capped.
//   - `report_cost` and `report_stage_times` answer the typed error `PEPYS_UNAVAILABLE`.
//     `item_get` and `runner_status` answer as on any day.
//   - Nothing pushes an alert in v1. The owner sees the lag when they read the status.
//   - When pepys answers again, the next try is 5 minutes away at most, and `boxxy outbox retry`
//     makes it now. 6,240 rows are 63 batches, sent one after the other with no wait. Until the
//     last one, each report carries `behind.facts` for its item.

// ── F. What boxxy reads back from pepys ────────────────────────────────────────────────────────
//
// Two queries, for the two report procedures, and nothing else. The build removes the port
// `CostReader` of the existing code; `PepysReader` is the port. It is a port because the report
// handlers are tested with a fake. The shapes of the queries belong to the boxxy pepys package
// (`@boxxy/pepys`, ../pepys-package/), and their output schemas to `@boxxy/model`.

// The port, the adapter and the fake are the same as in the boxxy pepys package
// (../pepys-package/03-readers.ts).
//   - `CostToLand` and `StageTime` are the outputs of the two queries, from `costToLandSchema`
//     and `stageTimeSchema` in `@boxxy/model`.
//   - `createPepysReader` takes the environment, and passes it to `boxxy_stage_time`.
//   - The port takes boxxy's bare `ItemId`. The adapter adds the prefix `boxxy:item:`.
//   - An item that pepys has no fact of yet gives a `value` (no attempt, no line, seven steps
//     with null minutes), not `unavailable`.
//   - The adapter never throws and never retries. An answer that its schema refuses is `unavailable`.
import type { CostToLand, StageTime } from '@boxxy/model';

export interface PepysReader {
  readCostToLand: (item: ItemId) => Promise<PepysAnswer<CostToLand>>; // the query `boxxy_cost_to_land`
  readStageTime: (item: ItemId) => Promise<PepysAnswer<StageTime>>; // the query `boxxy_stage_time`; the environment is the adapter's
}
export type PepysAnswer<Value> = { readonly kind: 'value'; readonly value: Value } | { readonly kind: 'unavailable'; readonly reason: string };
export declare function createPepysReader(options: { apiOrigin: string; environment: string }): PepysReader; // packages/pepys/src/create-pepys-reader.ts

// libs/model/src/test-utils/create-fake-pepys-reader.ts
export interface FakePepysReader extends PepysReader {
  set: (item: ItemId, values: { cost?: CostToLand; stageTime?: StageTime }) => void; // an item with no value answers the empty value
  failNext: (reason: string) => void;
}
export declare function createFakePepysReader(): FakePepysReader;

// one suite for both adapters, as for `FactSink`
export declare function pepysReaderContract(make: () => Promise<{ reader: PepysReader; takeDown: () => Promise<void> }>): void;

// Only `report.cost` and `report.stageTimes` hold a `PepysReader`. A lint rule
// (`no-restricted-imports`) keeps `@boxxy/pepys` out of `@boxxy/model`, `@boxxy/planning`,
// `@boxxy/dispatch`, `@boxxy/closeout` and `@boxxy/rules`.
//
// What boxxy never reads from pepys:
//   - `decide`, `claimNext`, `findPosition` and the derived state of an item: the store only.
//   - Whether a pull request merged or closed: the forge, through the pull request watch. boxxy
//     writes its own sighting (`boxxy.pull_request.merged`) and reads that row.
//   - Limits, seats, leases, sleep and wake: the store and the worker reading.
//   - Whether a fact reached pepys: the outbox row's `sent_at`. boxxy never asks pepys what it
//     holds, and never reads its own facts back.
//   - The merge, release and deploy times: boxxy does not store them. It passes them through
//     from `boxxy_stage_time` in a report and decides nothing on them.
// So pepys can be down, behind, empty or absent, and every decision of boxxy is the same.
// `decisions.pepys_offsets` is `{}` in every decision row, as in slice 1.
