import { expect, test } from 'bun:test';
import {
  listOwnerProcedures,
  listOwnerTools,
  listSessionProcedures,
  listSessionTools,
} from './list-owner-procedures.ts';

test('#listOwnerProcedures lists the 21 owner procedures', () => {
  const rows = listOwnerProcedures();

  expect([rows.length, rows]).toStrictEqual([
    21,
    expect.arrayContaining([['item.close'], ['runner.pause'], ['rules.dryRun']]),
  ]);
});

test('#listOwnerTools lists the 17 owner tools in snake case', () => {
  const rows = listOwnerTools();

  expect([rows.length, rows]).toStrictEqual([
    17,
    expect.arrayContaining([['item_file'], ['report_stage_times']]),
  ]);
});

test('#listSessionProcedures lists the three session and two hook procedures', () => {
  expect(listSessionProcedures()).toStrictEqual([
    ['attempt.current'],
    ['attempt.evidence'],
    ['attempt.closeOut'],
    ['attempt.bindSession'],
    ['attempt.recordPullRequest'],
  ]);
});

test('#listSessionTools lists the three session tools in snake case', () => {
  expect(listSessionTools()).toStrictEqual([
    ['attempt_current'],
    ['attempt_evidence'],
    ['attempt_close_out'],
  ]);
});
