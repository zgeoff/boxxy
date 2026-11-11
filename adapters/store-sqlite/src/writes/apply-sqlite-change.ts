import { buildAppliedChange, parseNewFact, pickSeatTake, toJSONValue } from '@boxxy/model';
import type { ApplyResult, Instant, RowWrite, SeatTake, StoreChange } from '@boxxy/model';
import { sql } from 'kysely';
import type { Kysely, RawBuilder } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { toStoreColumns } from '../codecs/to-store-columns.ts';
import type { StoreValue } from '../codecs/to-store-columns.ts';
import { buildSQLiteReader } from '../reads/build-sqlite-reader.ts';
import type { StoreDatabase } from '../types.ts';

// A savepoint, not the transaction, so a refusal keeps the caller's earlier changes in the same
// exclusive call. The caller runs one change at a time, so one savepoint name is enough.
export async function applySQLiteChange(
  db: Kysely<StoreDatabase>,
  change: StoreChange,
): Promise<ApplyResult> {
  const facts = change.facts.map((fact) => parseNewFact(fact));

  await sql`SAVEPOINT apply_change`.execute(db);

  try {
    const result = await writeSQLiteChange(db, { ...change, facts });

    if (result.kind !== 'applied') {
      await sql`ROLLBACK TO apply_change`.execute(db);
    }

    await sql`RELEASE apply_change`.execute(db);

    return result;
  } catch (error) {
    await removeSavepoint(db, error);

    throw error;
  }
}

async function writeSQLiteChange(
  db: Kysely<StoreDatabase>,
  change: StoreChange,
): Promise<ApplyResult> {
  if (!(await probeLiveUnder(db, change.under))) {
    return { kind: 'stale-generation' };
  }

  const lastLever = await db
    .selectFrom('levers')
    .select((builder) => builder.fn.max('seq').as('seq'))
    .executeTakeFirst();

  const lastNotice = await db
    .selectFrom('notices')
    .select((builder) => builder.fn.max('id').as('id'))
    .executeTakeFirst();

  const applied = buildAppliedChange(change, {
    lastLeverSeq: lastLever?.seq ?? 0,
    lastNoticeId: lastNotice?.id ?? 0,
  });

  for (const write of applied.writes) {
    const refusal = await writeSQLiteRow(db, write, change.at);

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
        payload: JSON.stringify(toJSONValue(fact.payload)),
        sent_at: null,
        parked_at: null,
        parked_reason: null,
      })
      .execute();
  }

  return { kind: 'applied' };
}

async function probeLiveUnder(
  db: Kysely<StoreDatabase>,
  under: StoreChange['under'],
): Promise<boolean> {
  if (under === undefined || under === null) {
    return true;
  }

  const lease = await db
    .selectFrom('leases')
    .innerJoin('attempts', 'attempts.id', 'leases.attempt')
    .select('attempts.hold_gen')
    .where('leases.item', '=', under.item)
    .where('leases.phase', '=', under.phase)
    .where('leases.gen', '=', under.gen)
    .where('leases.released_at', 'is', null)
    .executeTakeFirst();

  return lease !== undefined && (under.holdGen === undefined || lease.hold_gen === under.holdGen);
}

function writeSQLiteRow(
  db: Kysely<StoreDatabase>,
  write: RowWrite,
  at: Instant,
): Promise<ApplyResult | null> {
  return match(write)
    .with({ op: 'take-seats' }, (seats) => writeSeatTake(db, seats.take, at))
    .with({ op: 'release-seats' }, async (seats) => {
      await db
        .updateTable('limit_seats')
        .set({ released_at: at })
        .where('attempt', '=', seats.release.attempt)
        .where('hold_gen', '=', seats.release.holdGen)
        .where('released_at', 'is', null)
        .execute();

      return null;
    })
    .with({ op: 'insert', table: 'leases' }, async (insert) => {
      const columns = toStoreColumns(insert.table, insert.row);

      // ON CONFLICT names the partial unique index, so SQLite skips a second live lease, not throws
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
        ? ({ kind: 'guard-mismatch', table: update.table, key: toJSONValue(update.key) } as const)
        : null;
    })
    .exhaustive();
}

// The write lock is held for the whole transaction, so the counts read here stay true until the
// seats are inserted.
async function writeSeatTake(
  db: Kysely<StoreDatabase>,
  take: SeatTake,
  at: Instant,
): Promise<ApplyResult | null> {
  const limits = await buildSQLiteReader(db).listLimits();

  const answer = pickSeatTake(take, limits, at);

  if (answer.kind !== 'take') {
    return { kind: answer.kind, limit: answer.limit };
  }

  for (const seat of answer.seats) {
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

  return null;
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

// SQLite rolls the whole transaction back by itself after some errors, such as a full disk, and the
// savepoint is gone; the rollback's own error then joins the first one, never replaces it.
async function removeSavepoint(db: Kysely<StoreDatabase>, cause: unknown): Promise<void> {
  try {
    await sql`ROLLBACK TO apply_change`.execute(db);
    await sql`RELEASE apply_change`.execute(db);
  } catch (rollbackError) {
    throw new AggregateError([cause, rollbackError], 'the change failed, and so did its rollback', {
      cause: rollbackError,
    });
  }
}
