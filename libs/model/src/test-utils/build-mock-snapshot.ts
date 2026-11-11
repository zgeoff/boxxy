import type { SliceOneSnapshot as Snapshot } from '../slice-one/types.ts';

export function buildMockSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return { storeVersion: 1, items: [], relations: [], levers: [], freeSlots: {}, ...overrides };
}
