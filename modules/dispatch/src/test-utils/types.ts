import type { ClaimStore } from '@boxxy/model';

// One case of the ClaimStore contract: a test title, and a check that runs against a new store.
export type ClaimStoreCase = readonly [title: string, check: (store: ClaimStore) => Promise<void>];
