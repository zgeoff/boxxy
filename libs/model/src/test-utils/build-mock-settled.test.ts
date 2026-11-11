import { expect, test } from 'bun:test';
import { buildMockSettled } from './build-mock-settled.ts';

test('it builds a settled attempt with no failure', () => {
  const settled: unknown = buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 3000 });

  expect(settled).toStrictEqual({ phase: 'build', outcome: 'built', endedAt: 3000, failure: null });
});

test('it keeps the failure it is given', () => {
  const settled = buildMockSettled({
    phase: 'build',
    outcome: 'lost',
    endedAt: 3000,
    failure: 'no-capacity',
  });

  expect(settled.failure).toBe('no-capacity');
});
