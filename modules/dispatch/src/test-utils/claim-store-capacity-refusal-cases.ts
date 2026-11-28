import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, ClaimStore, DecisionRow } from '@boxxy/model';
import { buildMockCapacityRefusalRow } from '@boxxy/model/test-utils/build-mock-capacity-refusal-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockBindChange } from './build-mock-bind-change.ts';
import { buildMockCapacityRefusalChange } from './build-mock-capacity-refusal-change.ts';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import type { ClaimStoreCase } from './types.ts';

const removedAgentSession = brandSchemas.agentSessionId.parse('agent-removed');

export const claimStoreCapacityRefusalCases: readonly ClaimStoreCase[] = [
  [
    '#readCapacityRefusals returns the latest refusal and the count since the last started session',
    async (store) => {
      const refusal = {
        code: 'host_unavailable',
        problem: 'ram_budget_exceeded',
        message: 'not enough 2 MiB pages',
      };

      const before = buildMockCapacityRefusalRow({
        at: brandSchemas.instant.parse(1000),
        refusal,
      });

      const first = buildMockCapacityRefusalRow({ at: brandSchemas.instant.parse(3000) });

      const latest = buildMockCapacityRefusalRow({
        at: brandSchemas.instant.parse(4000),
        refusal,
      });

      const started = buildMockV1AttemptRow({
        state: 'running',
        atcSession: brandSchemas.atcSessionId.parse('s1'),
        startedAt: brandSchemas.instant.parse(2000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: started.item })),
        );

        await transaction.applyChange(buildMockClaimChange(started));

        for (const row of [before, first, latest]) {
          await transaction.applyChange(buildMockCapacityRefusalChange(row));
        }
      });

      const read = await store.read((transaction) => transaction.readCapacityRefusals());

      return {
        received: read,
        expected: {
          latest: { attempt: latest.attempt, at: brandSchemas.instant.parse(4000), refusal },
          count: 2,
        },
      };
    },
  ],
  [
    '#readCapacityRefusals counts a refusal claimed after the last started session in the same tick',
    async (store) => {
      const tick = brandSchemas.instant.parse(5000);

      const before = buildMockCapacityRefusalRow({
        at: tick,
        attempt: brandSchemas.attemptId.parse('01900000-0000-7000-8000-00000000000a'),
      });

      const after = buildMockCapacityRefusalRow({
        at: tick,
        attempt: brandSchemas.attemptId.parse('01900000-0000-7000-8000-00000000000c'),
      });

      const started = buildMockV1AttemptRow({
        id: brandSchemas.attemptId.parse('01900000-0000-7000-8000-00000000000b'),
        state: 'running',
        atcSession: brandSchemas.atcSessionId.parse('s2'),
        startedAt: tick,
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: started.item })),
        );

        await transaction.applyChange(buildMockClaimChange(started));
        await transaction.applyChange(buildMockCapacityRefusalChange(before));
        await transaction.applyChange(buildMockCapacityRefusalChange(after));
      });

      const read = await store.read((transaction) => transaction.readCapacityRefusals());

      return { received: read?.count, expected: 1 };
    },
  ],
  [
    '#readCapacityRefusals returns no latest refusal when atc refused no spawn for capacity',
    async (store) => {
      const read = await store.read((transaction) => transaction.readCapacityRefusals());

      return { received: read, expected: { latest: null, count: 0 } };
    },
  ],
  [
    '#applyChange on remove-attempt deletes the attempt',
    async (store) => {
      const seeded = await seedRemovedAttempt(store);

      const read = await store.read((transaction) =>
        transaction.listItemAttempts(seeded.attempt.item),
      );

      return { received: read.map((row) => row.id), expected: [seeded.kept.id] };
    },
  ],
  [
    '#applyChange on remove-attempt deletes the seats of the attempt',
    async (store) => {
      await seedRemovedAttempt(store);

      const read = await store.read((transaction) => transaction.listLimitSeats());

      return { received: read, expected: [] };
    },
  ],
  [
    '#applyChange on remove-attempt deletes the bound sessions of the attempt',
    async (store) => {
      await seedRemovedAttempt(store);

      const read = await store.read((transaction) =>
        transaction.findAttemptByAgentSession(removedAgentSession),
      );

      return { received: read, expected: null };
    },
  ],
  [
    '#applyChange on remove-attempt deletes the decisions of the attempt',
    async (store) => {
      const seeded = await seedRemovedAttempt(store);

      const result = await store.exclusive((transaction) =>
        transaction.applyChange({
          at: seeded.attempt.claimedAt,
          writes: [{ op: 'insert', table: 'decisions', row: buildRemovedDecision(seeded.attempt) }],
          facts: [],
        }),
      );

      return { received: result, expected: { kind: 'applied' } };
    },
  ],
  [
    '#applyChange on remove-attempt keeps the lease generation, so the next lease takes a new one',
    async (store) => {
      const seeded = await seedRemovedAttempt(store);

      const read = await store.read((transaction) =>
        transaction.readLastLeaseGen(seeded.attempt.item, seeded.attempt.phase),
      );

      return { received: read, expected: seeded.attempt.leaseGen };
    },
  ],
  [
    '#applyChange returns stale-generation for a write under the lease of a removed attempt',
    async (store) => {
      const seeded = await seedRemovedAttempt(store);

      const result = await store.exclusive((transaction) =>
        transaction.applyChange({
          at: seeded.attempt.claimedAt,
          under: {
            item: seeded.attempt.item,
            phase: seeded.attempt.phase,
            gen: seeded.attempt.leaseGen,
          },
          writes: [],
          facts: [],
        }),
      );

      return { received: result, expected: { kind: 'stale-generation' } };
    },
  ],
];

// An attempt with a held seat, a bound session, a decision and a lease, which the same change as
// the lease release then removes. A second attempt of the item stays.
async function seedRemovedAttempt(
  store: ClaimStore,
): Promise<{ readonly attempt: AttemptRow; readonly kept: AttemptRow }> {
  const workers = brandSchemas.limitName.parse('workers');

  const attempt = buildMockV1AttemptRow({
    state: 'failed',
    atcSession: brandSchemas.atcSessionId.parse('atc-removed'),
  });

  const kept = buildMockV1AttemptRow({
    item: attempt.item,
    phase: brandSchemas.phaseName.parse('verify'),
    leaseGen: 1,
  });

  await store.exclusive(async (transaction) => {
    await transaction.syncLimits(
      [{ name: workers, max: 2, counts: {} }],
      brandSchemas.instant.parse(500),
    );

    await transaction.applyChange(
      buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
    );

    await transaction.applyChange(buildMockClaimChange(attempt, [workers]));

    await transaction.applyChange(
      buildMockBindChange({ attempt, agentSession: removedAgentSession }),
    );

    await transaction.applyChange({
      at: attempt.claimedAt,
      writes: [{ op: 'insert', table: 'decisions', row: buildRemovedDecision(attempt) }],
      facts: [],
    });

    await transaction.applyChange({
      at: attempt.claimedAt,
      writes: [
        {
          op: 'update',
          table: 'leases',
          key: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
          expect: { attempt: attempt.id, releasedAt: null },
          set: { releasedAt: attempt.claimedAt },
        },
        { op: 'remove-attempt', attempt: attempt.id },
      ],
      facts: [],
    });

    await transaction.applyChange(buildMockClaimChange(kept));
  });

  return { attempt, kept };
}

function buildRemovedDecision(attempt: AttemptRow): DecisionRow {
  return {
    id: brandSchemas.decisionId.parse('01900000-0000-7000-8000-000000000001'),
    attempt: attempt.id,
    item: attempt.item,
    kind: 'start',
    pool: brandSchemas.poolName.parse('build'),
    rulesVersion: attempt.rulesVersion,
    snapshotHash: brandSchemas.snapshotHash.parse('c'.repeat(64)),
    storeVersion: 1,
    pepysOffsets: {},
    faults: [],
    limits: [],
    at: attempt.claimedAt,
  };
}
