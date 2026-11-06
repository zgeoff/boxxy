import type { ItemRows } from '../types/core.ts';

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
