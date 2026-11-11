import type { Frame } from '../planning/types.ts';

export function buildMockFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    candidates: [],
    fields: new Map(),
    values: new Map(),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
    ...overrides,
  };
}
