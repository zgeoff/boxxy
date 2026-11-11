import { expect, test } from 'bun:test';
import { buildMockAttemptReadRow } from './build-mock-attempt-read-row.ts';

test('it builds an unsettled attempt row with no sleep', () => {
  const row = buildMockAttemptReadRow();

  expect({ endedAt: row.ended_at, outcome: row.outcome, sleeps: row.sleeps }).toStrictEqual({
    endedAt: null,
    outcome: null,
    sleeps: [],
  });
});

test('it keeps an override', () => {
  expect(buildMockAttemptReadRow({ phase: 'review' }).phase).toBe('review');
});
