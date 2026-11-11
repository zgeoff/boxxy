import type { AttemptReadRow } from '../queries/types.ts';

export function buildMockAttemptReadRow(overrides: Partial<AttemptReadRow> = {}): AttemptReadRow {
  return {
    id: 'boxxy:attempt:0193a1b2-0000-7000-8000-0000000000a1',
    phase: 'build',
    number: 1,
    round: 1,
    state: 'succeeded',
    outcome: null,
    failure: null,
    claimed_at: '2026-11-11T02:00:00.000Z',
    ended_at: null,
    sleeps: [],
    ...overrides,
  };
}
