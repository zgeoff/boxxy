import { expect, test } from 'bun:test';
import { pickHoldState } from './pick-hold-state.ts';

test.each([
  {
    title: 'held by a lever for the reason',
    shown: { derived: { state: 'held', reason: 'owner stop' }, position: { kind: 'phase' } },
    expected: 'held',
  },
  {
    title: 'held by a lever for a different reason',
    shown: { derived: { state: 'held', reason: 'owner stop' }, position: { kind: 'phase' } },
    reason: 'needs-owner',
    expected: 'held for another reason',
  },
  {
    title: 'held by a rules hold for the reason',
    shown: {
      derived: { state: 'waiting', reason: 'needs-owner' },
      position: { kind: 'hold', reason: 'needs-owner' },
    },
    reason: 'needs-owner',
    expected: 'held',
  },
  {
    title: 'held by a rules hold for a different reason',
    shown: {
      derived: { state: 'waiting', reason: 'blocked' },
      position: { kind: 'hold', reason: 'blocked' },
    },
    reason: 'needs-owner',
    expected: 'held for another reason',
  },
  {
    title: 'ready',
    shown: { derived: { state: 'ready' }, position: { kind: 'phase' } },
    expected: 'lifted',
  },
  {
    title: 'waiting for a reason that is no hold',
    shown: {
      derived: { state: 'waiting', reason: 'owner stop' },
      position: { kind: 'end', reason: 'reviewed' },
    },
    expected: 'lifted',
  },
])('#pickHoldState reads "$expected" for an item $title', (row) => {
  expect(pickHoldState(row.shown, row.reason ?? 'owner stop')).toBe(row.expected);
});
