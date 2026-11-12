import { expect, test } from 'bun:test';
import { isCapacityRefusal } from './is-capacity-refusal.ts';
import { AtcCallError } from './mcp/atc-call-error.ts';

test.each([
  ['host_unavailable', 'ram_budget_exceeded', true],
  ['host_unavailable', 'busy', false],
  ['host_unavailable', 'impd_outdated', false],
  ['host_unavailable', null, false],
  ['target_unavailable', null, false],
  ['host_leased', 'ram_budget_exceeded', false],
] as const)(
  'it reads the code %s with the problem %s as capacity: %s',
  (code, problem, expected) => {
    expect(isCapacityRefusal(new AtcCallError(code, 'refused', problem))).toBe(expected);
  },
);
