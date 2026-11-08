import type { Snapshot } from '../types/planning.ts';

export function buildMockSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return { storeVersion: 1, items: [], links: [], levers: [], freeSlots: {}, ...overrides };
}
