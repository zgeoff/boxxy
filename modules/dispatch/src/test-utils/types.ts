import type { ClaimStore } from '@boxxy/model';

export type ClaimStoreCase = readonly [title: string, check: (store: ClaimStore) => Promise<void>];
