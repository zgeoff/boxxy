import { expect, test } from 'bun:test';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockSettleChange } from './build-mock-settle-change.ts';

test('it builds a settle under the live generations that releases the lease and the seats', () => {
  const attempt = buildMockV1AttemptRow({ state: 'running', leaseGen: 2, holdGen: 3 });
  const change: unknown = buildMockSettleChange({ attempt, state: 'succeeded' });

  expect(change).toStrictEqual({
    at: 3000,
    under: { item: attempt.item, phase: attempt.phase, gen: 2, holdGen: 3 },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: 'running' },
        set: { state: 'succeeded', failure: null, outcome: 'built', endedAt: 3000 },
      },
      {
        op: 'update',
        table: 'leases',
        key: { item: attempt.item, phase: attempt.phase, gen: 2 },
        expect: { releasedAt: null },
        set: { releasedAt: 3000 },
      },
      { op: 'release-seats', release: { attempt: attempt.id, holdGen: 3 } },
    ],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.attempt.settled',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          attempt: attempt.id,
          phase: attempt.phase,
          round: 1,
          state: 'succeeded',
          failure: null,
          outcome: 'built',
          returnedOutcome: null,
          closing: null,
          asleep: false,
          sessionStopped: true,
          endedAt: 3000,
          criteria: [],
          matched: [],
          frictionDropped: 0,
          skippedEffects: [],
        },
      },
    ],
  });
});

test('it gives a failed settle the outcome lost and the reason closeout-missing', () => {
  const attempt = buildMockV1AttemptRow({ state: 'running' });
  const change = buildMockSettleChange({ attempt, state: 'failed' });

  expect(change.writes[0]).toStrictEqual(
    expect.objectContaining({
      set: { state: 'failed', failure: 'closeout-missing', outcome: 'lost', endedAt: 3000 },
    }),
  );
});
