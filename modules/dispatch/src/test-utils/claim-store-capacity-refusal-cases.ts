import { brandSchemas } from '@boxxy/model';
import { buildMockCapacityRefusalRow } from '@boxxy/model/test-utils/build-mock-capacity-refusal-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockCapacityRefusalChange } from './build-mock-capacity-refusal-change.ts';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import type { ClaimStoreCase } from './types.ts';

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
    '#readCapacityRefusals counts a refusal that shares its tick with the last started session',
    async (store) => {
      const tick = brandSchemas.instant.parse(5000);
      const refused = buildMockCapacityRefusalRow({ at: tick });

      const started = buildMockV1AttemptRow({
        state: 'running',
        atcSession: brandSchemas.atcSessionId.parse('s2'),
        startedAt: tick,
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: started.item })),
        );

        await transaction.applyChange(buildMockClaimChange(started));
        await transaction.applyChange(buildMockCapacityRefusalChange(refused));
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
    '#applyChange deletes an attempt with its lease, seats, bound sessions and decisions on remove-attempt',
    async (store) => {
      const attempt = buildMockV1AttemptRow({ state: 'failed', atcSession: null });
      const kept = buildMockV1AttemptRow({ item: attempt.item, number: 2 });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(
          buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
        );

        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.applyChange({
          at: attempt.claimedAt,
          writes: [{ op: 'remove-attempt', attempt: attempt.id }],
          facts: [],
        });

        await transaction.applyChange(buildMockClaimChange(kept));
      });

      const read = await store.read((transaction) => transaction.listItemAttempts(attempt.item));

      return { received: read.map((row) => row.id), expected: [kept.id] };
    },
  ],
];
