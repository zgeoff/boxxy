import type { FactId, Instant, PullRequestRef, RunnerId, StoreChange, StoreTx } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { applySQLiteChange } from './apply-sqlite-change.ts';
import { buildSQLiteReader } from './build-sqlite-reader.ts';
import type { StoreDatabase } from './types.ts';

type PoolCounts = Parameters<StoreTx['syncPoolSlots']>[0];

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
    listLiveAttempts: inTurn(reader.listLiveAttempts),
    listSucceededAttemptsWithoutPr: inTurn(reader.listSucceededAttemptsWithoutPr),
    findAttemptBySession: inTurn(reader.findAttemptBySession),
    findAttemptByAgentSession: inTurn(reader.findAttemptByAgentSession),
    listWatchedPullRequests: inTurn(reader.listWatchedPullRequests),
    listPoolSlots: inTurn(reader.listPoolSlots),
    readUnsentFacts: inTurn(reader.readUnsentFacts),
    readOutboxLag: inTurn(reader.readOutboxLag),
    readRunner: inTurn(reader.readRunner),
    applyChange: inTurn((change: StoreChange) => applySQLiteChange(db, change)),
    markFactsSent: inTurn((ids: FactId[], at: Instant) => writeFactsSent(db, ids, at)),
    writeHeartbeat: inTurn((runner: RunnerId, at: Instant) => writeRunnerBeat(db, runner, at)),
    syncPoolSlots: inTurn((pools: PoolCounts) => writePoolSlots(db, pools)),
    markPullRequestChecked: inTurn((ref: PullRequestRef, at: Instant) =>
      writePullRequestChecked(db, ref, at),
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
  ids: FactId[],
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
    .execute();
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

async function writePoolSlots(db: Kysely<StoreDatabase>, pools: PoolCounts): Promise<void> {
  for (const pool of pools) {
    const rows = Array.from({ length: pool.slots }, (_, index) => ({
      pool: pool.name,
      slot: index + 1,
      holder: null,
      gen: 0,
      retired: 0,
    }));

    if (rows.length > 0) {
      await db
        .insertInto('pool_slots')
        .values(rows)
        .onConflict((conflict) => conflict.columns(['pool', 'slot']).doNothing())
        .execute();
    }
  }

  await db.updateTable('pool_slots').set({ retired: 1 }).execute();

  for (const pool of pools) {
    await db
      .updateTable('pool_slots')
      .set({ retired: 0 })
      .where('pool', '=', pool.name)
      .where('slot', '<=', pool.slots)
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
