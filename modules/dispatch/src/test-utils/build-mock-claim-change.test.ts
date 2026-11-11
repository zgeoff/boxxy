import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';

test('it builds a claim that takes the lease and a seat in each named limit', () => {
  const attempt = buildMockV1AttemptRow({ state: 'starting', holdGen: 1 });
  const workers = brandSchemas.limitName.parse('workers');
  const change: unknown = buildMockClaimChange(attempt, [workers]);

  expect(change).toStrictEqual({
    at: attempt.claimedAt,
    writes: [
      {
        op: 'take-seats',
        take: { limits: ['workers'], attempt: attempt.id, holdGen: 1, overCap: false },
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
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.attempt.claimed',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          attempt: attempt.id,
          phase: attempt.phase,
          number: attempt.number,
          round: 1,
          mode: 'agent',
          pool: attempt.pool,
          fields: {},
          seats: [{ limit: 'workers' }],
          recipeHash: attempt.recipeHash,
          skillsRef: null,
          rulesVersion: attempt.rulesVersion,
        },
      },
    ],
  });
});

test('it takes no seat when it names no limit', () => {
  const attempt = buildMockV1AttemptRow({ state: 'starting' });
  const change = buildMockClaimChange(attempt);

  expect(change.writes[0]).toStrictEqual({
    op: 'take-seats',
    take: { limits: [], attempt: attempt.id, holdGen: attempt.holdGen, overCap: false },
  });
});
