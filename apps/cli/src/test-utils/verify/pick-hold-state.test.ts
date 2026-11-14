import { expect, test } from 'bun:test';
import { pickHoldState } from './pick-hold-state.ts';

test.each([
  {
    title: 'held for the reason',
    derived: { state: 'held', reason: 'attempts used up' },
    expected: 'held',
  },
  {
    title: 'held for a different reason',
    derived: { state: 'held', reason: 'needs-owner' },
    expected: 'held for another reason',
  },
  { title: 'ready', derived: { state: 'ready' }, expected: 'lifted' },
  {
    title: 'in another state that carries the reason',
    derived: { state: 'waiting', reason: 'attempts used up' },
    expected: 'lifted',
  },
])('#pickHoldState reads "$expected" for an item $title', (row) => {
  expect(pickHoldState(row.derived, 'attempts used up')).toBe(row.expected);
});
