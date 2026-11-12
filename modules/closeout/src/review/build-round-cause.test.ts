import { expect, test } from 'bun:test';
import { buildMockSettled } from '@boxxy/model/test-utils/build-mock-settled';
import { buildRoundCause } from './build-round-cause.ts';

test.each([
  ['no attempt', [], 'first'],
  ['a build only', [['build', 'built']], 'first'],
  [
    'a lost review only',
    [
      ['build', 'built'],
      ['review', 'lost'],
    ],
    'first',
  ],
  [
    'a review that asked for changes, then its build',
    [
      ['build', 'built'],
      ['review', 'changes-requested'],
      ['build', 'built'],
    ],
    'rework',
  ],
  [
    'a failed review',
    [
      ['build', 'built'],
      ['review', 'failed'],
    ],
    'recheck',
  ],
  [
    'a passed review, then a merge that sent the item back',
    [
      ['build', 'built'],
      ['review', 'passed'],
      ['merge', 'repair'],
      ['build', 'built'],
    ],
    'recheck',
  ],
  [
    'a review that asked for changes, then a failed verify',
    [
      ['review', 'changes-requested'],
      ['build', 'built'],
      ['review', 'passed'],
      ['verify', 'failed'],
      ['build', 'built'],
    ],
    'recheck',
  ],
  [
    'a review that asked for changes, then a lost review',
    [
      ['review', 'changes-requested'],
      ['build', 'built'],
      ['review', 'lost'],
    ],
    'recheck',
  ],
] as const)('it gives the cause of a round after %s', (_title, attempts, expected) => {
  const history = attempts.map(([phase, outcome], index) =>
    buildMockSettled({ phase, outcome, endedAt: 1000 * (index + 1) }),
  );

  expect(buildRoundCause(history)).toBe(expected);
});
