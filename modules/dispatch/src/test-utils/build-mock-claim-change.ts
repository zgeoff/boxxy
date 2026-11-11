import type { AttemptRow, LimitName, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

// A claim that takes the lease and a seat in each named limit, and inserts the attempt as given.
export function buildMockClaimChange(
  attempt: AttemptRow,
  limits: readonly LimitName[] = [],
): StoreChange {
  return {
    at: attempt.claimedAt,
    writes: [
      {
        op: 'take-seats',
        take: { limits, attempt: attempt.id, holdGen: attempt.holdGen, overCap: false },
      },
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
      { op: 'insert', table: 'attempts', row: attempt },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.claimed',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          attempt: attempt.id,
          phase: attempt.phase,
          number: attempt.number,
          round: attempt.round,
          mode: attempt.mode,
          pool: attempt.pool,
          fields: attempt.fields,
          seats: limits.map((limit) => ({ limit })),
          recipeHash: attempt.recipeHash,
          skillsRef: null,
          rulesVersion: attempt.rulesVersion,
        },
      },
    ],
  };
}
