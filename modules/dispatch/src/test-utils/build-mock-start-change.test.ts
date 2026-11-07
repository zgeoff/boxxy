import { expect, test } from 'bun:test';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockStartChange } from './build-mock-start-change.ts';

test('it builds a start under the attempt lease gen that moves it to running', () => {
  const attempt = buildMockAttemptRow({ state: 'starting', leaseGen: 3 });
  const change: unknown = buildMockStartChange(attempt);

  expect(change).toStrictEqual({
    at: 2500,
    under: { item: attempt.item, phase: attempt.phase, gen: 3 },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: 'starting' },
        set: { state: 'running', atcSession: 'atc-session-1', startedAt: 2500 },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.attempt.started',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: { atcSession: 'atc-session-1' },
      },
    ],
  });
});
