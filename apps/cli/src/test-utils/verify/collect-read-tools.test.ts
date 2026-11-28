import { expect, test } from 'bun:test';
import { collectReadTools } from './collect-read-tools.ts';

test('it lists the owner tools that take the read scope, by MCP tool name', () => {
  expect(collectReadTools()).toIncludeSameMembers([
    'notices_show',
    'item_get',
    'attempt_get',
    'item_list',
    'runner_status',
    'report_cost',
    'report_stage_times',
    'signoff_list',
  ]);
});
