import type { ClaimStore } from '@boxxy/model';

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
