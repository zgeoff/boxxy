import type { ClaimStore } from '@boxxy/model';

export interface ClaimStoreOutcome {
  readonly received: unknown;
  readonly expected: unknown;
}

export type ClaimStoreCase = readonly [
  title: string,
  check: (store: ClaimStore) => Promise<ClaimStoreOutcome>,
];
