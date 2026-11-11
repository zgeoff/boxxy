import type { ClaimStore, Limit, LimitSeatRow, OutboxFact, TableName, Tables } from '@boxxy/model';

export interface ClosableClaimStore extends ClaimStore {
  close: () => Promise<void>;
}

export interface ClaimStoreOutcome {
  readonly received: unknown;
  readonly expected: unknown;
}

export type ClaimStoreCase = readonly [
  title: string,
  check: (store: ClosableClaimStore) => Promise<ClaimStoreOutcome>,
];

// The memory store's tables: one array per table that a row write names, and the ones only the
// store writes.
export type MemoryTables = { [T in TableName]: Tables[T][] } & {
  outbox: OutboxFact[];
  limits: Limit[];
  limit_seats: LimitSeatRow[];
};
