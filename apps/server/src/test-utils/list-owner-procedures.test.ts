import { expect, test } from 'bun:test';
import {
  listOwnerProcedures,
  listOwnerTools,
  listSessionProcedures,
  listSessionTools,
} from './list-owner-procedures.ts';

test('#listOwnerProcedures lists the 33 owner procedures', () => {
  const rows = listOwnerProcedures();

  expect([rows.length, rows]).toStrictEqual([
    33,
    expect.arrayContaining([
      ['item.close'],
      ['attempt.get'],
      ['item.release'],
      ['runner.pause'],
      ['notices.register'],
      ['notices.show'],
      ['rules.dryRun'],
    ]),
  ]);
});

test('#listOwnerTools lists the 25 owner tools in snake case', () => {
  const rows = listOwnerTools();

  expect([rows.length, rows]).toStrictEqual([
    25,
    expect.arrayContaining([
      ['item_file'],
      ['attempt_get'],
      ['item_release'],
      ['notices_register'],
      ['notices_show'],
      ['report_stage_times'],
    ]),
  ]);
});

test('#listSessionProcedures lists the five session and two hook procedures', () => {
  expect(listSessionProcedures()).toStrictEqual([
    ['attempt.current'],
    ['attempt.evidence'],
    ['attempt.closeOut'],
    ['attempt.listItems'],
    ['attempt.getItem'],
    ['attempt.bindSession'],
    ['attempt.recordPullRequest'],
  ]);
});

test('#listSessionTools lists the five session tools in snake case', () => {
  expect(listSessionTools()).toStrictEqual([
    ['attempt_current'],
    ['attempt_evidence'],
    ['attempt_close_out'],
    ['attempt_list_items'],
    ['attempt_get_item'],
  ]);
});
