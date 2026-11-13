import { expect, test } from 'bun:test';
import { collectCheckStates } from './collect-check-states.ts';

test.each([
  ['queued', null, 'pending'],
  ['in_progress', null, 'pending'],
  ['completed', 'success', 'success'],
  ['completed', 'failure', 'failure'],
  ['completed', 'timed_out', 'failure'],
  ['completed', 'startup_failure', 'failure'],
  ['completed', 'cancelled', 'other'],
  ['completed', 'skipped', 'other'],
  ['completed', 'neutral', 'other'],
  ['completed', 'action_required', 'other'],
  ['completed', 'stale', 'other'],
] as const)(
  'it reads a check run with status %s and conclusion %s as %s',
  (status, conclusion, expected) => {
    const states = collectCheckStates([{ id: 1, name: 'pr / checks', status, conclusion }], []);

    expect(states).toStrictEqual(new Map([['pr / checks', expected]]));
  },
);

test.each([
  ['success', 'success'],
  ['failure', 'failure'],
  ['error', 'failure'],
  ['pending', 'pending'],
] as const)('it reads a commit status in state %s as %s', (state, expected) => {
  const states = collectCheckStates([], [{ context: 'deploy/preview', state }]);

  expect(states).toStrictEqual(new Map([['deploy/preview', expected]]));
});

test('it reads the run with the highest id of a name, in any order', () => {
  const states = collectCheckStates(
    [
      { id: 9, name: 'verify / gate', status: 'completed', conclusion: 'failure' },
      { id: 3, name: 'verify / gate', status: 'completed', conclusion: 'success' },
    ],
    [],
  );

  expect(states).toStrictEqual(new Map([['verify / gate', 'failure']]));
});

test('it reads a check run over a commit status of the same name', () => {
  const states = collectCheckStates(
    [{ id: 1, name: 'pr / checks', status: 'completed', conclusion: 'success' }],
    [{ context: 'pr / checks', state: 'failure' }],
  );

  expect(states).toStrictEqual(new Map([['pr / checks', 'success']]));
});
