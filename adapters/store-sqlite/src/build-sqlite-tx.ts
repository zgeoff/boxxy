import type { StoreTx } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { applySQLiteChange } from './apply-sqlite-change.ts';
import { buildSQLiteReader } from './build-sqlite-reader.ts';
import type { StoreDatabase } from './types.ts';

export function buildSQLiteTx(db: Kysely<StoreDatabase>): StoreTx {
  // Calls started together would interleave their statements on the one connection and share the
  // change's savepoint, so each change waits for the one before it.
  let turn: Promise<unknown> = Promise.resolve();

  return {
    ...buildSQLiteReader(db),
    applyChange: async (change) => {
      const previous = turn;
      const next = Promise.withResolvers<void>();

      turn = next.promise;

      await previous;

      try {
        return await applySQLiteChange(db, change);
      } finally {
        next.resolve();
      }
    },
    markFactsSent: async (ids, at) => {
      if (ids.length === 0) {
        return;
      }

      await db
        .updateTable('outbox')
        .set({ sent_at: at })
        .where('fact_id', 'in', ids)
        .where('sent_at', 'is', null)
        .execute();
    },
    writeHeartbeat: async (runner, at) => {
      await db
        .insertInto('runners')
        .values({ id: runner, heartbeat_at: at, paused: 0 })
        .onConflict((conflict) => conflict.column('id').doUpdateSet({ heartbeat_at: at }))
        .execute();
    },
    syncPoolSlots: async (pools) => {
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
    },
    markPullRequestChecked: async (ref, at) => {
      await db
        .updateTable('pull_requests')
        .set({ checked_at: at })
        .where('repo', '=', ref.repo)
        .where('number', '=', ref.number)
        .execute();
    },
  };
}
