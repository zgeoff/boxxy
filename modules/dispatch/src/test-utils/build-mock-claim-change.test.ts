import { expect, test } from 'bun:test';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';

test('it builds a claim that takes a slot and a lease, with slot and gen left at 0', () => {
  const attempt = buildMockAttemptRow({ state: 'starting' });
  const change: unknown = buildMockClaimChange(attempt);

  expect(change).toStrictEqual({
    at: attempt.claimedAt,
    writes: [
      { op: 'take-slot', pool: attempt.pool, holder: attempt.id },
      {
        op: 'insert',
        table: 'leases',
        row: {
          item: attempt.item,
          phase: attempt.phase,
          attempt: attempt.id,
          gen: attempt.leaseGen,
          takenAt: attempt.claimedAt,
          releasedAt: null,
        },
      },
      { op: 'insert', table: 'attempts', row: { ...attempt, slot: 0, slotGen: 0 } },
    ],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.attempt.claimed',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          item: attempt.item,
          phase: attempt.phase,
          number: attempt.number,
          pool: attempt.pool,
          slot: 0,
          gen: 0,
          recipeHash: attempt.recipeHash,
          rulesVersion: attempt.rulesVersion,
        },
      },
    ],
  });
});
