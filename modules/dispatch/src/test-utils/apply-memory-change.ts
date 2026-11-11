import { isDeepStrictEqual } from 'node:util';
import { buildAppliedChange, parseNewFact, pickSeatTake, toJSONValue } from '@boxxy/model';
import type {
  ApplyResult,
  Instant,
  RowWrite,
  SeatRelease,
  SeatTake,
  StoreChange,
  TableName,
} from '@boxxy/model';
import { match } from 'ts-pattern';
import { collectMemoryLimitFills } from './collect-memory-limit-fills.ts';
import { isSameHeldSeat } from './is-same-held-seat.ts';
import type { MemoryTables } from './types.ts';

// all or none: a refusal or a throw puts every table back as it was
export function applyMemoryChange(tables: MemoryTables, change: StoreChange): ApplyResult {
  const before = structuredClone(tables);

  try {
    const result = writeMemoryChange(tables, change);

    if (result.kind !== 'applied') {
      Object.assign(tables, before);
    }

    return result;
  } catch (error) {
    Object.assign(tables, before);
    throw error;
  }
}

function writeMemoryChange(tables: MemoryTables, change: StoreChange): ApplyResult {
  const facts = change.facts.map((fact) => parseNewFact(fact));

  if (!hasLiveUnder(tables, change.under)) {
    return { kind: 'stale-generation' };
  }

  const leverSeqs = tables.levers.map((lever) => lever.seq);
  const noticeIds = tables.notices.map((notice) => notice.id);

  const applied = buildAppliedChange(
    { ...change, facts },
    { lastLeverSeq: Math.max(0, ...leverSeqs), lastNoticeId: Math.max(0, ...noticeIds) },
  );

  for (const write of applied.writes) {
    const refusal = applyMemoryWrite(tables, write, change.at);

    if (refusal !== null) {
      return refusal;
    }
  }

  for (const fact of applied.facts) {
    if (tables.outbox.some((row) => row.factId === fact.id)) {
      throw new Error('UNIQUE constraint failed: outbox (factId)');
    }

    tables.outbox.push({
      seq: tables.outbox.length + 1,
      factId: fact.id,
      type: fact.type,
      entity: fact.entity,
      actor: fact.actor,
      at: change.at,
      payload: toJSONValue(fact.payload),
      sentAt: null,
      parkedAt: null,
      parkedReason: null,
    });
  }

  return { kind: 'applied' };
}

function hasLiveUnder(tables: MemoryTables, under: StoreChange['under']): boolean {
  if (under === undefined || under === null) {
    return true;
  }

  const lease = tables.leases.find(
    (row) =>
      row.item === under.item &&
      row.phase === under.phase &&
      row.gen === under.gen &&
      row.releasedAt === null,
  );

  if (lease === undefined) {
    return false;
  }

  return (
    under.holdGen === undefined ||
    tables.attempts.some(
      (attempt) => attempt.id === lease.attempt && attempt.holdGen === under.holdGen,
    )
  );
}

function applyMemoryWrite(tables: MemoryTables, write: RowWrite, at: Instant): ApplyResult | null {
  return match(write)
    .with({ op: 'take-seats' }, (seats) => takeMemorySeats(tables, seats.take, at))
    .with({ op: 'release-seats' }, (seats) => {
      releaseMemorySeats(tables, seats.release, at);

      return null;
    })
    .with({ op: 'insert', table: 'leases' }, (insert) => {
      const isHeld = tables.leases.some(
        (row) =>
          row.item === insert.row.item && row.phase === insert.row.phase && row.releasedAt === null,
      );

      if (isHeld) {
        return { kind: 'lease-held' } as const;
      }

      insertMemoryRow(tables, insert.table, insert.row);

      return null;
    })
    .with({ op: 'insert' }, (insert) => {
      insertMemoryRow(tables, insert.table, insert.row);

      return null;
    })
    .with({ op: 'update' }, (update) => {
      const rows: object[] = tables[update.table];

      const matched = rows.filter(
        (row) => hasFields(row, update.key) && hasFields(row, update.expect),
      );

      if (matched.length === 0) {
        const key = toJSONValue(update.key);

        return { kind: 'guard-mismatch', table: update.table, key } as const;
      }

      for (const row of matched) {
        Object.assign(row, structuredClone(update.set));

        assertMemoryUnique(update.table, rows, row);
      }

      return null;
    })
    .exhaustive();
}

function takeMemorySeats(tables: MemoryTables, take: SeatTake, at: Instant): ApplyResult | null {
  const answer = pickSeatTake(take, collectMemoryLimitFills(tables), at);

  if (answer.kind !== 'take') {
    return { kind: answer.kind, limit: answer.limit };
  }

  for (const seat of answer.seats) {
    if (tables.limit_seats.some((held) => isSameHeldSeat(seat, held))) {
      throw new Error('UNIQUE constraint failed: limit_seats (limit, attempt, holdGen)');
    }

    tables.limit_seats.push(seat);
  }

  return null;
}

function releaseMemorySeats(tables: MemoryTables, release: SeatRelease, at: Instant): void {
  for (const seat of tables.limit_seats) {
    if (
      seat.attempt === release.attempt &&
      seat.holdGen === release.holdGen &&
      seat.releasedAt === null
    ) {
      Object.assign(seat, { releasedAt: at });
    }
  }
}

function insertMemoryRow(tables: MemoryTables, table: TableName, row: object): void {
  const rows: object[] = tables[table];
  const copy = structuredClone(row);

  rows.push(copy);

  assertMemoryUnique(table, rows, copy);
}

interface UniqueKey {
  readonly fields: readonly string[];

  // a partial unique index covers only the rows where this field is null
  readonly live?: string;
}

// A kept session binds one agent session to a later attempt, so the agent session alone is no key.
const uniqueKeys: Readonly<Record<TableName, readonly UniqueKey[]>> = {
  items: [{ fields: ['id'] }],
  relations: [
    { fields: ['source', 'target', 'type', 'addedAt'] },
    { fields: ['source', 'target', 'type'], live: 'removedAt' },
  ],
  levers: [{ fields: ['seq'] }],
  attempts: [{ fields: ['id'] }, { fields: ['item', 'phase', 'number'] }],
  attempt_sessions: [{ fields: ['attempt', 'agentSession'] }],
  leases: [{ fields: ['item', 'phase', 'gen'] }, { fields: ['item', 'phase'], live: 'releasedAt' }],
  decisions: [{ fields: ['id'] }],
  evidence: [{ fields: ['factId'] }, { fields: ['attempt', 'kind', 'ref'] }],
  pull_requests: [{ fields: ['repo', 'number'] }],
  runners: [{ fields: ['id'] }],
  notes: [{ fields: ['item', 'seq'] }],
  notices: [{ fields: ['id'] }],
};

function assertMemoryUnique(table: TableName, rows: readonly object[], row: object): void {
  const fields = toFieldMap(row);

  for (const key of uniqueKeys[table]) {
    const hasClash = rows.some((other) => {
      const otherFields = toFieldMap(other);

      return (
        other !== row &&
        (key.live === undefined ||
          (fields.get(key.live) === null && otherFields.get(key.live) === null)) &&
        key.fields.every((field) => isDeepStrictEqual(otherFields.get(field), fields.get(field)))
      );
    });

    if (hasClash) {
      throw new Error(`UNIQUE constraint failed: ${table} (${key.fields.join(', ')})`);
    }
  }
}

function toFieldMap(row: object): Map<string, unknown> {
  return new Map<string, unknown>(Object.entries(row));
}

function hasFields(row: object, fields: object): boolean {
  const rowFields = toFieldMap(row);

  return Object.entries(fields).every(([field, value]: [string, unknown]) =>
    isDeepStrictEqual(rowFields.get(field), value),
  );
}
