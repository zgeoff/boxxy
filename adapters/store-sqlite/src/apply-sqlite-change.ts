import { buildAppliedChange, findSlotTake, toJsonValue } from '@boxxy/model';
import type { ApplyResult, RowWrite, SlotTake, StoreChange, TakenSlot } from '@boxxy/model';
import { sql } from 'kysely';
import type { Kysely, RawBuilder } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { toStoreColumns } from './to-store-columns.ts';
import type { StoreValue } from './to-store-columns.ts';
import type { StoreDatabase } from './types.ts';

// Runs inside the caller's transaction. A savepoint undoes the writes of a refused change, so a
// refusal writes nothing, and the caller's earlier changes stay.
export async function applySQLiteChange(
  db: Kysely<StoreDatabase>,
  change: StoreChange,
): Promise<ApplyResult> {
  invariant(change.facts.length > 0, 'a change writes at least one fact');

  await sql`SAVEPOINT apply_change`.execute(db);

  const result = await writeSQLiteChange(db, change).catch(async (error: unknown) => {
    await sql`ROLLBACK TO apply_change`.execute(db);
    await sql`RELEASE apply_change`.execute(db);

    throw error;
  });

  if (result.kind !== 'applied') {
    await sql`ROLLBACK TO apply_change`.execute(db);
  }

  await sql`RELEASE apply_change`.execute(db);

  return result;
}

async function writeSQLiteChange(
  db: Kysely<StoreDatabase>,
  change: StoreChange,
): Promise<ApplyResult> {
  if (!(await probeLiveUnder(db, change.under))) {
    return { kind: 'stale-generation' };
  }

  const take = findSlotTake(change.writes);
  const taken = take === null ? null : await writeSlotTake(db, take);

  if (take !== null && taken === null) {
    return { kind: 'no-free-slot' };
  }

  const lastLever = await db
    .selectFrom('levers')
    .select((eb) => eb.fn.max('seq').as('seq'))
    .executeTakeFirst();

  const applied = buildAppliedChange(change, { taken, lastLeverSeq: lastLever?.seq ?? 0 });

  for (const write of applied.writes) {
    const refusal = await writeSQLiteRow(db, write);

    if (refusal !== null) {
      return refusal;
    }
  }

  for (const fact of applied.facts) {
    await db
      .insertInto('outbox')
      .values({
        fact_id: fact.id,
        type: fact.type,
        entity: fact.entity,
        actor: fact.actor,
        at: change.at,
        payload: JSON.stringify(toJsonValue(fact.payload)),
        sent_at: null,
      })
      .execute();
  }

  const slot = taken === null ? null : { pool: taken.pool, slot: taken.slot, gen: taken.gen };

  return { kind: 'applied', slot };
}

async function probeLiveUnder(
  db: Kysely<StoreDatabase>,
  under: StoreChange['under'],
): Promise<boolean> {
  if (under === undefined) {
    return true;
  }

  const lease = await db
    .selectFrom('leases')
    .select('gen')
    .where('item', '=', under.item)
    .where('phase', '=', under.phase)
    .where('gen', '=', under.gen)
    .where('released_at', 'is', null)
    .executeTakeFirst();

  if (lease === undefined || under.slot === undefined) {
    return lease !== undefined;
  }

  const slot = await db
    .selectFrom('pool_slots')
    .select('gen')
    .where('pool', '=', under.slot.pool)
    .where('slot', '=', under.slot.slot)
    .where('gen', '=', under.slot.gen)
    .where('holder', 'is not', null)
    .executeTakeFirst();

  return slot !== undefined;
}

// The guarded update from the store schema: it takes the lowest free slot that isn't retired, and
// changes no row when the pool has none.
async function writeSlotTake(db: Kysely<StoreDatabase>, take: SlotTake): Promise<TakenSlot | null> {
  const lowest = db
    .selectFrom('pool_slots')
    .select((eb) => eb.fn.min('slot').as('slot'))
    .where('pool', '=', take.pool)
    .where('holder', 'is', null)
    .where('retired', '=', 0);

  const row = await db
    .updateTable('pool_slots')
    .set((eb) => ({ holder: take.holder, gen: eb('gen', '+', 1) }))
    .where('pool', '=', take.pool)
    .where('slot', '=', lowest)
    .where('holder', 'is', null)
    .where('retired', '=', 0)
    .returning(['slot', 'gen'])
    .executeTakeFirst();

  return row === undefined
    ? null
    : { holder: take.holder, pool: take.pool, slot: row.slot, gen: row.gen };
}

function writeSQLiteRow(db: Kysely<StoreDatabase>, write: RowWrite): Promise<ApplyResult | null> {
  return match(write)
    .with({ op: 'take-slot' }, () => Promise.resolve(null))
    .with({ op: 'release-slot' }, async (release) => {
      const result = await db
        .updateTable('pool_slots')
        .set({ holder: null })
        .where('pool', '=', release.pool)
        .where('slot', '=', release.slot)
        .where('holder', '=', release.holder)
        .executeTakeFirst();

      return result.numUpdatedRows === 0n ? ({ kind: 'stale-generation' } as const) : null;
    })
    .with({ op: 'insert', table: 'leases' }, async (insert) => {
      const columns = toStoreColumns(insert.table, insert.row);

      // the partial unique index on leases refuses a second live lease on one item phase
      const result = await sql`${buildInsert(insert.table, columns)}
        ON CONFLICT (item, phase) WHERE released_at IS NULL DO NOTHING`.execute(db);

      return result.numAffectedRows === 0n ? ({ kind: 'lease-held' } as const) : null;
    })
    .with({ op: 'insert' }, async (insert) => {
      await buildInsert(insert.table, toStoreColumns(insert.table, insert.row)).execute(db);

      return null;
    })
    .with({ op: 'update' }, async (update) => {
      const set = toStoreColumns(update.table, update.set);

      const guards = [
        ...toStoreColumns(update.table, update.key),
        ...toStoreColumns(update.table, update.expect),
      ];

      invariant(set.length > 0, 'an update sets at least one field');

      const result = await sql`UPDATE ${sql.table(update.table)}
        SET ${sql.join(set.map(([column, value]) => sql`${sql.ref(column)} = ${value}`))}
        WHERE ${buildGuards(guards)}`.execute(db);

      return result.numAffectedRows === 0n
        ? ({ kind: 'guard-mismatch', table: update.table, key: toJsonValue(update.key) } as const)
        : null;
    })
    .exhaustive();
}

function buildInsert(table: string, columns: [string, StoreValue][]): RawBuilder<unknown> {
  return sql`INSERT INTO ${sql.table(table)}
    (${sql.join(columns.map(([column]) => sql.ref(column)))})
    VALUES (${sql.join(columns.map(([, value]) => value))})`;
}

// IS compares NULL as a value, so an expect of null matches a NULL column
function buildGuards(guards: [string, StoreValue][]): RawBuilder<unknown> {
  invariant(guards.length > 0, 'an update names its key');

  return sql.join(
    guards.map(([column, value]) => sql`${sql.ref(column)} IS ${value}`),
    sql` AND `,
  );
}
