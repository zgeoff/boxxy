import { expect, test } from 'bun:test';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockSettleChange } from './build-mock-settle-change.ts';

test('it builds a settle under both leases that releases them', () => {
  const attempt = buildMockAttemptRow({ state: 'running', leaseGen: 2, slot: 3, slotGen: 4 });
  const change: unknown = buildMockSettleChange({ attempt, state: 'succeeded' });

  expect(change).toStrictEqual({
    at: 3000,
    under: {
      item: attempt.item,
      phase: attempt.phase,
      gen: 2,
      slot: { pool: attempt.pool, slot: 3, gen: 4 },
    },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: 'running' },
        set: { state: 'succeeded', failure: null, endedAt: 3000 },
      },
      {
        op: 'update',
        table: 'leases',
        key: { item: attempt.item, phase: attempt.phase, gen: 2 },
        expect: { releasedAt: null },
        set: { releasedAt: 3000 },
      },
      { op: 'release-slot', pool: attempt.pool, slot: 3, holder: attempt.id },
    ],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.attempt.settled',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          state: 'succeeded',
          failure: null,
          endedAt: 3000,
          criteria: [],
          matched: [],
          frictionDropped: 0,
        },
      },
    ],
  });
});

test('it gives a failed settle the reason closeout-missing', () => {
  const attempt = buildMockAttemptRow({ state: 'running' });
  const change = buildMockSettleChange({ attempt, state: 'failed' });

  expect(change.writes[0]).toStrictEqual(
    expect.objectContaining({
      set: { state: 'failed', failure: 'closeout-missing', endedAt: 3000 },
    }),
  );
});
