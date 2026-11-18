import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
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
    buildMockSettled({
      phase,
      outcome,
      endedAt: 1000 * (index + 1),
      pullRequest: { repo: 'acme/widgets', number: 12 },
    }),
  );

  expect(
    buildRoundCause(history, { repo: brandSchemas.repoName.parse('acme/widgets'), number: 12 }),
  ).toBe(expected);
});

test.each([
  [
    'a review that asked for changes on the same pull request, then its build',
    [
      {
        phase: 'review',
        outcome: 'changes-requested',
        pullRequest: { repo: 'acme/widgets', number: 12 },
      },
      { phase: 'build', outcome: 'built' },
    ],
    { repo: 'acme/widgets', number: 12 },
    'rework',
  ],
  [
    'a passed review on the same pull request, then its build',
    [
      { phase: 'review', outcome: 'passed', pullRequest: { repo: 'acme/widgets', number: 12 } },
      { phase: 'build', outcome: 'built' },
    ],
    { repo: 'acme/widgets', number: 12 },
    'recheck',
  ],
  [
    'a review on another pull request',
    [
      {
        phase: 'review',
        outcome: 'changes-requested',
        pullRequest: { repo: 'acme/widgets', number: 13 },
      },
      { phase: 'build', outcome: 'built' },
    ],
    { repo: 'acme/widgets', number: 12 },
    'first',
  ],
  [
    'a review in another repo with the same number',
    [
      {
        phase: 'review',
        outcome: 'changes-requested',
        pullRequest: { repo: 'acme/gadgets', number: 12 },
      },
      { phase: 'build', outcome: 'built' },
    ],
    { repo: 'acme/widgets', number: 12 },
    'first',
  ],
  [
    'a review whose pull request is unknown',
    [
      { phase: 'review', outcome: 'changes-requested', pullRequest: null },
      { phase: 'build', outcome: 'built' },
    ],
    { repo: 'acme/widgets', number: 12 },
    'first',
  ],
  [
    'a review that asked for changes, with no pull request to review now',
    [
      {
        phase: 'review',
        outcome: 'changes-requested',
        pullRequest: { repo: 'acme/widgets', number: 12 },
      },
    ],
    null,
    'first',
  ],
] as const)('it gives the cause of a round after %s', (_title, attempts, current, expected) => {
  const history = attempts.map((attempt, index) =>
    buildMockSettled({ ...attempt, endedAt: 1000 * (index + 1) }),
  );

  const pullRequest =
    current === null
      ? null
      : { repo: brandSchemas.repoName.parse(current.repo), number: current.number };

  expect(buildRoundCause(history, pullRequest)).toBe(expected);
});
