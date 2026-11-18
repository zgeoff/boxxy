import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
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

      const refused = (endedAt: number, withRefusal: boolean) =>
        buildMockV1AttemptRow({
          state: 'failed',
          failure: 'no-capacity',
          outcome: 'lost',
          atcSession: null,
          startedAt: null,
          endedAt: brandSchemas.instant.parse(endedAt),
          refusal: withRefusal ? refusal : null,
        });

      const before = refused(1000, true);
      const first = refused(3000, false);
      const latest = refused(4000, true);

      const started = buildMockV1AttemptRow({
        state: 'running',
        atcSession: brandSchemas.atcSessionId.parse('s1'),
        startedAt: brandSchemas.instant.parse(2000),
      });

      await store.exclusive(async (transaction) => {
        for (const attempt of [before, started, first, latest]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const read = await store.read((transaction) => transaction.readCapacityRefusals());

      return {
        received: read,
        expected: {
          latest: {
            attempt: latest.id,
            at: brandSchemas.instant.parse(4000),
            refusal,
          },
          count: 2,
        },
      };
    },
  ],
  [
    '#readCapacityRefusals counts a refusal that shares its tick with the last started session',
    async (store) => {
      const tick = brandSchemas.instant.parse(5000);

      const refused = () =>
        buildMockV1AttemptRow({
          state: 'failed',
          failure: 'no-capacity',
          outcome: 'lost',
          atcSession: null,
          startedAt: null,
          endedAt: tick,
          refusal: { code: 'host_unavailable', problem: null, message: 'no room' },
        });

      const earlier = refused();

      const started = buildMockV1AttemptRow({
        state: 'running',
        atcSession: brandSchemas.atcSessionId.parse('s2'),
        startedAt: tick,
      });

      const later = refused();

      await store.exclusive(async (transaction) => {
        for (const attempt of [earlier, started, later]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const read = await store.read((transaction) => transaction.readCapacityRefusals());

      return { received: read?.count, expected: 1 };
    },
  ],
  [
    '#readCapacityRefusals returns no latest refusal when no attempt ran out of capacity',
    async (store) => {
      const read = await store.read((transaction) => transaction.readCapacityRefusals());

      return { received: read, expected: { latest: null, count: 0 } };
    },
  ],
];
