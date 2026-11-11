import { expect, test } from 'bun:test';
import { buildMockItemRows } from './build-mock-item-rows.ts';

test('it builds default item rows', () => {
  const built: unknown = buildMockItemRows();

  expect(built).toStrictEqual({
    relations: [],
    blockerStates: new Map(),
    levers: [],
    attempts: [],
    liveLease: null,
    pullRequests: [],
    maxAttempts: 2,
  });
});

test('it applies overrides on top of the defaults', () => {
  const rows = buildMockItemRows({ maxAttempts: 3 });

  expect(rows).toStrictEqual(expect.objectContaining({ maxAttempts: 3 }));
});
