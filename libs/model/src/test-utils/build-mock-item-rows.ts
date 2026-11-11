import type { SliceOneItemRows as ItemRows } from '../slice-one/types.ts';

export function buildMockItemRows(overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    relations: [],
    blockerStates: new Map(),
    levers: [],
    attempts: [],
    liveLease: null,
    pullRequests: [],
    maxAttempts: 2,
    ...overrides,
  };
}
