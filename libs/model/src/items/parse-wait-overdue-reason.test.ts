import { expect, test } from 'bun:test';
import { buildWaitOverdueReason } from './build-wait-overdue-reason.ts';
import { parseWaitOverdueReason } from './parse-wait-overdue-reason.ts';

test.each([
  { kind: 'shipped', hours: 6 },
  { kind: 'deploy-ready', hours: 1.5 },
])('it parses the reason it builds for $kind and $hours hours', (row) => {
  expect(parseWaitOverdueReason(buildWaitOverdueReason(row.kind, row.hours))).toStrictEqual(row);
});

test.each(['wait-skip:shipped', 'wait-overdue:shipped', 'wait-overdue:shipped:soon'])(
  'it parses no overdue wait from %s',
  (reason) => {
    expect(parseWaitOverdueReason(reason)).toBeNull();
  },
);
