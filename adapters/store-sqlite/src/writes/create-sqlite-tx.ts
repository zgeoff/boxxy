import { formatCanonicalJson } from '@boxxy/content-hash';
import { collectSeatSync, toJSONValue } from '@boxxy/model';
import type {
  FactId,
  Instant,
  Limit,
  PullRequestRef,
  RunnerId,
  StoreChange,
  StoreReader,
  StoreTx,
} from '@boxxy/model';
import type { Kysely } from 'kysely';
import { buildSQLiteReader } from '../reads/build-sqlite-reader.ts';
import type { StoreDatabase } from '../types.ts';
import { applySQLiteChange } from './apply-sqlite-change.ts';

// A call started beside a change would run its statements inside the change's savepoint, and a
// refusal would roll them back after the call resolved, so every call waits for the one before it.
export function createSQLiteTx(db: Kysely<StoreDatabase>): StoreTx {
  const inTurn = makeTurnRunner();
  const reader = buildSQLiteReader(db);

  return {
    readSnapshot: inTurn(reader.readSnapshot),
    readItem: inTurn(reader.readItem),
    readItemDetail: inTurn(reader.readItemDetail),
    listItems: inTurn(reader.listItems),
    listOpenIssues: inTurn(reader.listOpenIssues),
    readLastLeaseGen: inTurn(reader.readLastLeaseGen),
    readAttempt: inTurn(reader.readAttempt),
    listEvidence: inTurn(reader.listEvidence),
    listItemAttempts: inTurn(reader.listItemAttempts),
    listLiveAttempts: inTurn(reader.listLiveAttempts),
    listStrayAttempts: inTurn(reader.listStrayAttempts),
    listSucceededAttemptsWithoutPullRequest: inTurn(reader.listSucceededAttemptsWithoutPullRequest),
    findAttemptBySession: inTurn(reader.findAttemptBySession),
    findAttemptByAgentSession: inTurn(reader.findAttemptByAgentSession),
    findSessionByCaller: inTurn(reader.findSessionByCaller),
    listWatchedPullRequests: inTurn(reader.listWatchedPullRequests),
    listLimits: inTurn(reader.listLimits),
    listLimitSeats: inTurn(reader.listLimitSeats),
    listItemNotes: inTurn(reader.listItemNotes),
    listUnsentNotices: inTurn(reader.listUnsentNotices),
    listKeptSessions: inTurn(reader.listKeptSessions),
    listSessionsToForget: inTurn(reader.listSessionsToForget),
    readRunner: inTurn(reader.readRunner),
    readUnsentFacts: inTurn(reader.readUnsentFacts),
    readOutboxCounts: inTurn(reader.readOutboxCounts),
    readItemBehind: inTurn(reader.readItemBehind),
    applyChange: inTurn((change: StoreChange) => applySQLiteChange(db, change)),
    markFactsSent: inTurn((ids: readonly FactId[], at: Instant) => writeFactsSent(db, ids, at)),
    parkFacts: inTurn((ids: readonly FactId[], reason: string, at: Instant) =>
      writeFactsParked(db, ids, reason, at),
    ),
    unparkFacts: inTurn(() => removeFactParks(db)),
    writeHeartbeat: inTurn((runner: RunnerId, at: Instant) => writeRunnerBeat(db, runner, at)),
    syncLimits: inTurn((limits: readonly Limit[], at: Instant) =>
      writeLimits(db, reader, limits, at),
    ),
    markPullRequestChecked: inTurn((ref: PullRequestRef, at: Instant) =>
      writePullRequestChecked(db, ref, at),
    ),
    markNoticeTried: inTurn((id: number, at: Instant, sent: boolean) =>
      writeNoticeTry(db, id, at, sent),
    ),
  };
}

function makeTurnRunner() {
  let turn: Promise<unknown> = Promise.resolve();

  return <Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) =>
    async (...args: Args): Promise<Result> => {
      const previous = turn;
      const next = Promise.withResolvers<void>();

      turn = next.promise;

      await previous;

      try {
        return await run(...args);
      } finally {
        next.resolve();
      }
    };
}

async function writeFactsSent(
  db: Kysely<StoreDatabase>,
  ids: readonly FactId[],
  at: Instant,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await db
    .updateTable('outbox')
    .set({ sent_at: at })
    .where('fact_id', 'in', ids)
    .where('sent_at', 'is', null)
    .where('parked_at', 'is', null)
    .execute();
}

async function writeFactsParked(
  db: Kysely<StoreDatabase>,
  ids: readonly FactId[],
  reason: string,
  at: Instant,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await db
    .updateTable('outbox')
    .set({ parked_at: at, parked_reason: reason })
    .where('fact_id', 'in', ids)
    .where('sent_at', 'is', null)
    .execute();
}

async function removeFactParks(db: Kysely<StoreDatabase>): Promise<number> {
  const result = await db
    .updateTable('outbox')
    .set({ parked_at: null, parked_reason: null })
    .where('sent_at', 'is', null)
    .where('parked_at', 'is not', null)
    .executeTakeFirst();

  return Number(result.numUpdatedRows);
}

async function writeRunnerBeat(
  db: Kysely<StoreDatabase>,
  runner: RunnerId,
  at: Instant,
): Promise<void> {
  await db
    .insertInto('runners')
    .values({ id: runner, heartbeat_at: at, paused: 0 })
    .onConflict((conflict) => conflict.column('id').doUpdateSet({ heartbeat_at: at }))
    .execute();
}

async function writeLimits(
  db: Kysely<StoreDatabase>,
  reader: StoreReader,
  limits: readonly Limit[],
  at: Instant,
): Promise<void> {
  const sync = collectSeatSync({
    limits,
    held: await reader.listLimitSeats(),
    attempts: await reader.listLiveAttempts(),
    at,
  });

  await db.deleteFrom('limits').execute();

  for (const limit of limits) {
    await db
      .insertInto('limits')
      .values({
        name: limit.name,
        max: limit.max,
        counts: formatCanonicalJson(toJSONValue(limit.counts)),
      })
      .execute();
  }

  for (const seat of sync.release) {
    await db
      .updateTable('limit_seats')
      .set({ released_at: at })
      .where('limit', '=', seat.limit)
      .where('attempt', '=', seat.attempt)
      .where('hold_gen', '=', seat.holdGen)
      .where('released_at', 'is', null)
      .execute();
  }

  for (const seat of sync.take) {
    await db
      .insertInto('limit_seats')
      .values({
        limit: seat.limit,
        attempt: seat.attempt,
        hold_gen: seat.holdGen,
        over_cap: seat.overCap ? 1 : 0,
        taken_at: seat.takenAt,
        released_at: seat.releasedAt,
      })
      .execute();
  }
}

async function writePullRequestChecked(
  db: Kysely<StoreDatabase>,
  ref: PullRequestRef,
  at: Instant,
): Promise<void> {
  await db
    .updateTable('pull_requests')
    .set({ checked_at: at })
    .where('repo', '=', ref.repo)
    .where('number', '=', ref.number)
    .execute();
}

async function writeNoticeTry(
  db: Kysely<StoreDatabase>,
  id: number,
  at: Instant,
  sent: boolean,
): Promise<void> {
  await db
    .updateTable('notices')
    .set((builder) => ({
      tries: builder('tries', '+', 1),
      ...(sent ? { sent_at: at } : {}),
    }))
    .where('id', '=', id)
    .execute();
}
