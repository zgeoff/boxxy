import { expect, test } from 'bun:test';
import { describeCheckedRefusal } from './describe-checked-refusal.ts';

test.each([
  {
    refusal: { reason: 'no-forge' },
    line: 'this server cannot read GitHub, so it records no check or verdict: record a test, a ci-run or a live-check',
  },
  {
    refusal: { reason: 'pull-request-closed' },
    line: 'the pull request is closed or merged: boxxy records no check or verdict for it',
  },
  {
    refusal: { reason: 'check-pending', check: 'pr / checks', head: 'abc' },
    line: 'check "pr / checks" is still running at abc: wait for it to finish, then record it again',
  },
  {
    refusal: { reason: 'check-failed', check: 'pr / checks', head: 'abc' },
    line: 'check "pr / checks" did not pass at abc: fix it, push, and record it again',
  },
  {
    refusal: { reason: 'check-missing', check: 'pr / checks', head: 'abc' },
    line: 'no check run named "pr / checks" at abc: use the exact name of a CI check run, because a commit status does not count',
  },
  {
    refusal: { reason: 'verify-pending', feature: 'file-item', head: 'abc' },
    line: 'the verify gate has not finished at abc: wait for it, then record the verdict again',
  },
  {
    refusal: { reason: 'verify-failed', feature: 'file-item', head: 'abc', note: 'no report' },
    line: 'the verify gate failed at abc (no report): fix the report, then record the verdict again',
  },
  {
    refusal: { reason: 'verdict-missing', feature: 'file-item', head: 'abc' },
    line: 'the verify report at abc lists no verified feature "file-item": run its journey and `bun verify publish`, then record the verdict again',
  },
])('it describes the refusal $refusal.reason', (row) => {
  expect(describeCheckedRefusal(row.refusal)).toBe(row.line);
});
