import type { AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

// The change leaves the slot to the store, as a claim does: slot and slot gen are 0.
export function buildMockClaimChange(attempt: AttemptRow): StoreChange {
  return {
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
        id: buildMockFactId(),
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
  };
}
