import { expect, test } from 'bun:test';
import { buildMockCapacityRefusalRow } from '@boxxy/model/test-utils/build-mock-capacity-refusal-row';
import { buildMockCapacityRefusalChange } from './build-mock-capacity-refusal-change.ts';

test('it builds a change that inserts the refusal and writes no fact', () => {
  const row = buildMockCapacityRefusalRow();
  const change: unknown = buildMockCapacityRefusalChange(row);

  expect(change).toStrictEqual({
    at: row.at,
    writes: [{ op: 'insert', table: 'capacity_refusals', row }],
    facts: [],
  });
});
