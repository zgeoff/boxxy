import { isDeepStrictEqual } from 'node:util';
import { buildAppliedChange, buildItemViews, findSlotTake, toJSONValue } from '@boxxy/model';
import type {
  ApplyResult,
  AttemptRow,
  ClaimStore,
  EvidenceRow,
  Instant,
  ItemSetRows,
  ItemView,
  ItemWithLevers,
  LinkRow,
  MaxAttemptsByKind,
  OutboxFact,
  PoolName,
  PullRequestRow,
  RowWrite,
  SlotTake,
  StoreChange,
  StoreReader,
  StoreTx,
  TableName,
  Tables,
  TakenSlot,
} from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';

export function createMemoryClaimStore(): ClaimStore {
  let committed = buildEmptyTables();
  let turn: Promise<void> = Promise.resolve();

  return {
    exclusive: async (work) => {
      const previous = turn;
      const next = Promise.withResolvers<void>();

      turn = next.promise;

      await previous;

      try {
        const draft = structuredClone(committed);

        const result = await work(buildMemoryTx(draft));

        committed = draft;

        return result;
      } finally {
        next.resolve();
      }
    },
    read: (work) => {
      const snapshot = committed;

      return work(buildMemoryReader(() => snapshot));
    },
  };
}

type MemoryTables = { [T in TableName]: Tables[T][] } & { outbox: OutboxFact[] };

function buildEmptyTables(): MemoryTables {
  return {
    items: [],
    links: [],
    levers: [],
    attempts: [],
    attempt_sessions: [],
    leases: [],
    pool_slots: [],
    decisions: [],
    evidence: [],
    pull_requests: [],
    runners: [],
    outbox: [],
  };
}

function buildMemoryTx(tables: MemoryTables): StoreTx {
  return {
    ...buildMemoryReader(() => tables),
    applyChange: (change) => Promise.try(() => applyMemoryChange(tables, change)),
    markFactsSent: (ids, at) => {
      for (const fact of tables.outbox) {
        if (ids.includes(fact.factId) && fact.sentAt === null) {
          Object.assign(fact, { sentAt: at });
        }
      }

      return Promise.resolve();
    },
    writeHeartbeat: (runner, at) => {
      const row = tables.runners.find((candidate) => candidate.id === runner);

      if (row === undefined) {
        tables.runners.push({ id: runner, heartbeatAt: at, paused: false });
      } else {
        Object.assign(row, { heartbeatAt: at });
      }

      return Promise.resolve();
    },
    syncPoolSlots: (pools) => {
      for (const pool of pools) {
        for (let slot = 1; slot <= pool.slots; slot += 1) {
          if (!tables.pool_slots.some((row) => row.pool === pool.name && row.slot === slot)) {
            tables.pool_slots.push({ pool: pool.name, slot, holder: null, gen: 0, retired: false });
          }
        }
      }

      for (const row of tables.pool_slots) {
        const slots = pools.find((pool) => pool.name === row.pool)?.slots ?? 0;

        Object.assign(row, { retired: row.slot > slots });
      }

      return Promise.resolve();
    },
    markPullRequestChecked: (ref, at) => {
      for (const row of tables.pull_requests) {
        if (row.repo === ref.repo && row.number === ref.number) {
          Object.assign(row, { checkedAt: at });
        }
      }

      return Promise.resolve();
    },
  };
}

// SQLite hands out new objects on each read, so a caller that keeps or edits a row never touches
// the store's own rows; each read here works on a copy to match.
function buildMemoryReader(getLiveTables: () => MemoryTables): StoreReader {
  const getTables = () => structuredClone(getLiveTables());

  const buildViews = (now: Instant, maxAttemptsByKind: MaxAttemptsByKind): ItemWithLevers[] =>
    buildItemViews(toItemSetRows(getTables()), now, maxAttemptsByKind);

  return {
    readSnapshot: (now, maxAttemptsByKind) => {
      const open = buildViews(now, maxAttemptsByKind).filter((item) => isOpen(item));

      return Promise.resolve({
        storeVersion: getTables().outbox.length,
        items: open.map((item) => toItemView(item)),
        links: sortLinks(getTables().links.filter((link) => link.removedAt === null)),
        levers: open
          .flatMap((item) => item.levers)
          .toSorted((first, second) => first.seq - second.seq),
        freeSlots: collectFreeSlots(getTables()),
      });
    },
    readItem: (id, now, maxAttemptsByKind) => {
      const item = buildViews(now, maxAttemptsByKind).find((view) => view.id === id);
      const view = item === undefined ? null : toItemView(item);

      return Promise.resolve(view);
    },
    readItemDetail: (id, now, maxAttemptsByKind) => {
      const tables = getTables();
      const item = buildViews(now, maxAttemptsByKind).find((view) => view.id === id);

      if (item === undefined) {
        return Promise.resolve(null);
      }

      const attempts = sortAttempts(tables.attempts.filter((attempt) => attempt.item === id));

      const attemptIds = new Set(attempts.map((attempt) => attempt.id));

      const links = sortLinks(
        tables.links.filter(
          (link) => link.removedAt === null && (link.source === id || link.target === id),
        ),
      );

      return Promise.resolve({
        item,
        attempts,
        links,
        evidence: sortEvidence(tables.evidence.filter((row) => attemptIds.has(row.attempt))),
        pullRequests: sortPullRequests(
          tables.pull_requests.filter((row) => attemptIds.has(row.attempt)),
        ),
      });
    },
    listItems: (filter, now, maxAttemptsByKind) =>
      Promise.resolve(
        buildViews(now, maxAttemptsByKind).filter(
          (item) =>
            (filter.state === undefined || item.derived.state === filter.state) &&
            (filter.repo === undefined || item.repo === filter.repo),
        ),
      ),
    listOpenIssues: (repo, now, maxAttemptsByKind) =>
      Promise.resolve(
        buildViews(now, maxAttemptsByKind)
          .filter((item) => item.kind === 'core.issue' && item.repo === repo && isOpen(item))
          .map((item) => toItemView(item)),
      ),
    readLastLeaseGen: (item, phase) => {
      const gens = getTables()
        .leases.filter((lease) => lease.item === item && lease.phase === phase)
        .map((lease) => lease.gen);

      return Promise.resolve(Math.max(0, ...gens));
    },
    readAttempt: (id) =>
      Promise.resolve(getTables().attempts.find((attempt) => attempt.id === id) ?? null),
    listEvidence: (attempt) =>
      Promise.resolve(sortEvidence(getTables().evidence.filter((row) => row.attempt === attempt))),
    listLiveAttempts: () =>
      Promise.resolve(
        sortAttempts(
          getTables().attempts.filter((attempt) =>
            ['starting', 'running', 'reconciling'].includes(attempt.state),
          ),
        ),
      ),
    listSucceededAttemptsWithoutPr: () => {
      const tables = getTables();

      const linked = new Set(tables.pull_requests.map((row) => row.attempt));

      return Promise.resolve(
        sortAttempts(
          tables.attempts.filter(
            (attempt) => attempt.state === 'succeeded' && !linked.has(attempt.id),
          ),
        ),
      );
    },
    findAttemptBySession: (session) =>
      Promise.resolve(
        sortAttempts(getTables().attempts).find((attempt) => attempt.atcSession === session) ??
          null,
      ),
    findAttemptByAgentSession: (session) =>
      Promise.resolve(
        getTables().attempt_sessions.find((row) => row.agentSession === session)?.attempt ?? null,
      ),
    listWatchedPullRequests: () =>
      Promise.resolve(
        sortPullRequests(getTables().pull_requests.filter((row) => row.state === 'open')),
      ),
    listPoolSlots: () =>
      Promise.resolve(
        getTables().pool_slots.toSorted(
          (first, second) => compareText(first.pool, second.pool) || first.slot - second.slot,
        ),
      ),
    readUnsentFacts: (limit) =>
      Promise.resolve(
        getTables()
          .outbox.filter((fact) => fact.sentAt === null)
          .slice(0, limit),
      ),
    readOutboxLag: () => {
      const unsent = getTables().outbox.filter((fact) => fact.sentAt === null);
      const oldest = unsent.toSorted((first, second) => first.at - second.at).at(0);

      return Promise.resolve({ unsent: unsent.length, oldestUnsentAt: oldest?.at ?? null });
    },
    readRunner: (id) => Promise.resolve(getTables().runners.find((row) => row.id === id) ?? null),
  };
}

function toItemSetRows(tables: MemoryTables): ItemSetRows {
  return {
    items: tables.items.toSorted(
      (first, second) => first.filedAt - second.filedAt || compareText(first.id, second.id),
    ),
    links: tables.links.filter((link) => link.removedAt === null),
    levers: tables.levers.toSorted((first, second) => first.seq - second.seq),
    attempts: sortAttempts(tables.attempts),
    liveLeases: tables.leases.filter((lease) => lease.releasedAt === null),
    pullRequests: tables.pull_requests,
  };
}

// SQLite's ORDER BY compares text byte by byte, and localeCompare doesn't
function compareText(first: string, second: string): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}

function sortAttempts(attempts: readonly AttemptRow[]): AttemptRow[] {
  return attempts.toSorted(
    (first, second) => first.claimedAt - second.claimedAt || compareText(first.id, second.id),
  );
}

function isOpen(item: ItemView): boolean {
  return item.derived.state !== 'done' && item.derived.state !== 'archived';
}

function toItemView(item: ItemWithLevers): ItemView {
  const { levers: _levers, ...view } = item;

  return view;
}

function sortLinks(links: readonly LinkRow[]): LinkRow[] {
  return links.toSorted(
    (first, second) =>
      first.addedAt - second.addedAt ||
      compareText(first.source, second.source) ||
      compareText(first.target, second.target),
  );
}

function collectFreeSlots(tables: MemoryTables): Record<PoolName, number> {
  const free: Record<PoolName, number> = {};

  for (const row of tables.pool_slots) {
    if (!row.retired) {
      free[row.pool] = (free[row.pool] ?? 0) + (row.holder === null ? 1 : 0);
    }
  }

  return free;
}

function sortEvidence(rows: readonly EvidenceRow[]): EvidenceRow[] {
  return rows.toSorted(
    (first, second) => first.at - second.at || compareText(first.factId, second.factId),
  );
}

function sortPullRequests(rows: readonly PullRequestRow[]): PullRequestRow[] {
  return rows.toSorted(
    (first, second) => compareText(first.repo, second.repo) || first.number - second.number,
  );
}

function applyMemoryChange(tables: MemoryTables, change: StoreChange): ApplyResult {
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
  invariant(change.facts.length > 0, 'a change writes at least one fact');

  if (!hasLiveUnder(tables, change.under)) {
    return { kind: 'stale-generation' };
  }

  const take = findSlotTake(change.writes);
  const taken = take === null ? null : takeMemorySlot(tables, take);

  if (take !== null && taken === null) {
    return { kind: 'no-free-slot' };
  }

  const lastLeverSeq = Math.max(0, ...tables.levers.map((lever) => lever.seq));
  const applied = buildAppliedChange(change, { taken, lastLeverSeq });

  for (const write of applied.writes) {
    const refusal = applyMemoryWrite(tables, write);

    if (refusal !== null) {
      return refusal;
    }
  }

  for (const fact of applied.facts) {
    invariant(
      !tables.outbox.some((row) => row.factId === fact.id),
      `the outbox holds fact ${fact.id}`,
    );

    tables.outbox.push({
      seq: tables.outbox.length + 1,
      factId: fact.id,
      type: fact.type,
      entity: fact.entity,
      actor: fact.actor,
      at: change.at,
      payload: toJSONValue(fact.payload),
      sentAt: null,
    });
  }

  return { kind: 'applied', slot: taken === null ? null : toSlotLease(taken) };
}

function hasLiveUnder(tables: MemoryTables, under: StoreChange['under']): boolean {
  if (under === undefined) {
    return true;
  }

  const hasLease = tables.leases.some(
    (row) =>
      row.item === under.item &&
      row.phase === under.phase &&
      row.gen === under.gen &&
      row.releasedAt === null,
  );

  const slot = under.slot;

  return (
    hasLease &&
    (slot === undefined ||
      tables.pool_slots.some(
        (row) =>
          row.pool === slot.pool &&
          row.slot === slot.slot &&
          row.gen === slot.gen &&
          row.holder !== null,
      ))
  );
}

function takeMemorySlot(tables: MemoryTables, take: SlotTake): TakenSlot | null {
  const free = tables.pool_slots
    .filter((row) => row.pool === take.pool && row.holder === null && !row.retired)
    .toSorted((first, second) => first.slot - second.slot)
    .at(0);

  if (free === undefined) {
    return null;
  }

  Object.assign(free, { holder: take.holder, gen: free.gen + 1 });

  return { holder: take.holder, pool: take.pool, slot: free.slot, gen: free.gen };
}

function applyMemoryWrite(tables: MemoryTables, write: RowWrite): ApplyResult | null {
  return match(write)
    .with({ op: 'take-slot' }, () => null)
    .with({ op: 'release-slot' }, (release) => {
      const row = tables.pool_slots.find(
        (candidate) =>
          candidate.pool === release.pool &&
          candidate.slot === release.slot &&
          candidate.holder === release.holder,
      );

      if (row === undefined) {
        return { kind: 'stale-generation' } as const;
      }

      Object.assign(row, { holder: null });

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

const uniqueKeys: Readonly<Record<TableName, readonly UniqueKey[]>> = {
  items: [{ fields: ['id'] }],
  links: [
    { fields: ['source', 'target', 'type', 'addedAt'] },
    { fields: ['source', 'target', 'type'], live: 'removedAt' },
  ],
  levers: [{ fields: ['seq'] }],
  attempts: [{ fields: ['id'] }, { fields: ['item', 'phase', 'number'] }],
  attempt_sessions: [{ fields: ['attempt', 'agentSession'] }, { fields: ['agentSession'] }],
  leases: [{ fields: ['item', 'phase', 'gen'] }, { fields: ['item', 'phase'], live: 'releasedAt' }],
  pool_slots: [{ fields: ['pool', 'slot'] }],
  decisions: [{ fields: ['id'] }],
  evidence: [{ fields: ['factId'] }, { fields: ['attempt', 'kind', 'ref'] }],
  pull_requests: [{ fields: ['repo', 'number'] }],
  runners: [{ fields: ['id'] }],
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

function toSlotLease(taken: TakenSlot): { pool: PoolName; slot: number; gen: number } {
  return { pool: taken.pool, slot: taken.slot, gen: taken.gen };
}
