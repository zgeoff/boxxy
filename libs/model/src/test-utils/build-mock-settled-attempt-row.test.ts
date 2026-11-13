import { expect, test } from 'bun:test';
import { buildMockSettledAttemptRow } from './build-mock-settled-attempt-row.ts';

test('it builds a succeeded attempt with the outcome and end it is given', () => {
  const row = buildMockSettledAttemptRow({ phase: 'review', outcome: 'passed', endedAt: 3000 });
  const received: unknown = [row.phase, row.state, row.outcome, row.endedAt, row.closeOut];

  expect(received).toStrictEqual(['review', 'succeeded', 'passed', 3000, null]);
});

test('it keeps the phase input it is given', () => {
  const row = buildMockSettledAttemptRow({
    phase: 'verify',
    outcome: 'failed',
    endedAt: 3000,
    input: { session: 'fresh' },
  });

  expect(row.input).toStrictEqual({ session: 'fresh' });
});

test('it keeps the state it is given', () => {
  const row = buildMockSettledAttemptRow({
    phase: 'review',
    outcome: 'failed',
    endedAt: 3000,
    state: 'failed',
  });

  expect(row.state).toBe('failed');
});
