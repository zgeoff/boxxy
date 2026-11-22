import { expect, test } from 'bun:test';
import type { CheckReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { pickCheckRefusal } from './pick-check-refusal.ts';

function setupTest() {
  return { head: brandSchemas.commitSha.parse('9c1e0f5a2b3c4d5e6f708192a3b4c5d6e7f80910') };
}

test('it passes a check run in success', () => {
  const ctx = setupTest();
  const reading: CheckReading = { state: 'success', source: 'check-run' };

  expect(pickCheckRefusal('pr / checks', ctx.head, reading)).toBeNull();
});

test.each([
  { state: 'pending', reason: 'check-pending' },
  { state: 'failure', reason: 'check-failed' },
  { state: 'other', reason: 'check-failed' },
] as const)('it refuses a check run in $state as $reason', (row) => {
  const ctx = setupTest();
  const reading: CheckReading = { state: row.state, source: 'check-run' };

  expect(pickCheckRefusal('pr / checks', ctx.head, reading)).toStrictEqual({
    reason: row.reason,
    check: 'pr / checks',
    head: ctx.head,
  });
});

test('it refuses a check that has no run as check-missing', () => {
  const ctx = setupTest();

  expect(pickCheckRefusal('pr / checks', ctx.head, undefined)).toStrictEqual({
    reason: 'check-missing',
    check: 'pr / checks',
    head: ctx.head,
  });
});

test.each(['success', 'failure', 'pending'] as const)(
  'it refuses a commit status in %s as check-missing',
  (state) => {
    const ctx = setupTest();
    const reading: CheckReading = { state, source: 'commit-status' };

    expect(pickCheckRefusal('pr / checks', ctx.head, reading)).toStrictEqual({
      reason: 'check-missing',
      check: 'pr / checks',
      head: ctx.head,
    });
  },
);
