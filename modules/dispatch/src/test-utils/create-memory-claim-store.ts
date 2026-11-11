import { collectSeatSync } from '@boxxy/model';
import type { StoreTx } from '@boxxy/model';
import { applyMemoryChange } from './apply-memory-change.ts';
import { buildMemoryReader } from './build-memory-reader.ts';
import { isSameHeldSeat } from './is-same-held-seat.ts';
import type { ClosableClaimStore, MemoryTables } from './types.ts';

export function createMemoryClaimStore(): ClosableClaimStore {
  let committed = buildEmptyTables();
  let turn: Promise<void> = Promise.resolve();
  let isClosed = false;
  let reads: Promise<unknown> = Promise.resolve();

  return {
    exclusive: async (work) => {
      if (isClosed) {
        throw new Error('the store is closed');
      }

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

      const reading = Promise.try(() => {
        if (isClosed) {
          throw new Error('the store is closed');
        }

        return work(buildMemoryReader(() => snapshot));
      });

      reads = Promise.allSettled([reads, reading]);

      return reading;
    },
    close: async () => {
      isClosed = true;

      await Promise.all([reads, turn]);
    },
  };
}

function buildEmptyTables(): MemoryTables {
  return {
    items: [],
    relations: [],
    levers: [],
    attempts: [],
    attempt_sessions: [],
    leases: [],
    decisions: [],
    evidence: [],
    pull_requests: [],
    runners: [],
    notes: [],
    notices: [],
    outbox: [],
    limits: [],
    limit_seats: [],
  };
}

function buildMemoryTx(tables: MemoryTables): StoreTx {
  return {
    ...buildMemoryReader(() => tables),
    applyChange: (change) => Promise.try(() => applyMemoryChange(tables, change)),
    markFactsSent: (ids, at) => {
      for (const fact of tables.outbox) {
        if (ids.includes(fact.factId) && fact.sentAt === null && fact.parkedAt === null) {
          Object.assign(fact, { sentAt: at });
        }
      }

      return Promise.resolve();
    },
    parkFacts: (ids, reason, at) => {
      for (const fact of tables.outbox) {
        if (ids.includes(fact.factId) && fact.sentAt === null) {
          Object.assign(fact, { parkedAt: at, parkedReason: reason });
        }
      }

      return Promise.resolve();
    },
    unparkFacts: () => {
      const parked = tables.outbox.filter((fact) => fact.sentAt === null && fact.parkedAt !== null);

      for (const fact of parked) {
        Object.assign(fact, { parkedAt: null, parkedReason: null });
      }

      return Promise.resolve(parked.length);
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
    syncLimits: (limits, at) => {
      const sync = collectSeatSync({
        limits,
        held: tables.limit_seats.filter((seat) => seat.releasedAt === null),
        attempts: tables.attempts,
        at,
      });

      tables.limits = structuredClone([...limits]);

      for (const seat of tables.limit_seats) {
        if (sync.release.some((released) => isSameHeldSeat(released, seat))) {
          Object.assign(seat, { releasedAt: at });
        }
      }

      tables.limit_seats.push(...structuredClone([...sync.take]));

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
    markNoticeTried: (id, at, sent) => {
      const row = tables.notices.find((candidate) => candidate.id === id);

      if (row !== undefined) {
        Object.assign(row, { tries: row.tries + 1, sentAt: sent ? at : row.sentAt });
      }

      return Promise.resolve();
    },
  };
}
