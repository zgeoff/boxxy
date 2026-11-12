import { expect, test } from 'bun:test';
import { listOwnerTools } from '../test-utils/list-owner-procedures.ts';
import { pickToolScope } from './pick-tool-scope.ts';

test.each(listOwnerTools())('it gives the owner tool %s a scope', (tool) => {
  expect(pickToolScope(tool)).toBeOneOf(['read', 'write']);
});

test.each([
  ['item_list', 'read'],
  ['item_get', 'read'],
  ['runner_status', 'read'],
  ['report_cost', 'read'],
  ['report_stage_times', 'read'],
  ['item_file', 'write'],
  ['item_note', 'write'],
  ['item_retry', 'write'],
  ['item_wake', 'write'],
  ['item_close', 'write'],
  ['plan_defer', 'write'],
  ['relation_add', 'write'],
] as const)('it gives %s the %s scope', (tool, scope) => {
  expect(pickToolScope(tool)).toBe(scope);
});

test.each([['attempt_current'], ['auth_enroll'], ['runner_pause'], ['no_such_tool']])(
  'it gives %s no scope, so the public door refuses it',
  (tool) => {
    expect(pickToolScope(tool)).toBeNull();
  },
);
