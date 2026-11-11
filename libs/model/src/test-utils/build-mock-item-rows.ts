import type { ItemRows } from '../types.ts';

export function buildMockItemRows(overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    links: [],
    blockerStates: new Map(),
    levers: [],
    attempts: [],
    liveLease: null,
    pullRequests: [],
    maxAttempts: 2,
    ...overrides,
  };
}
