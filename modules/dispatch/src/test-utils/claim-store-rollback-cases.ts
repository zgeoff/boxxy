import { brandSchemas } from '@boxxy/model';
import type { StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreRollbackCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange takes back the lease and seat releases of a settle whose guard fails',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 1, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt, [workers]));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, state: 'running' }, state: 'failed' }),
        ),
      );

      const state: unknown = await store.read(async (transaction) => {
        const read = await transaction.readAttempt(attempt.id);
        const facts = await transaction.readUnsentFacts(10);
        const limits = await transaction.listLimits();

        const view = await transaction.readItem(
          item.id,
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        return {
          attempt: read?.state,
          facts: facts.length,
          held: limits.map((limit) => limit.held),
          item: view?.derived,
        };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'guard-mismatch', table: 'attempts', key: { id: attempt.id } },
          state: { attempt: 'starting', facts: 2, held: [1], item: { state: 'running' } },
        },
      };
    },
  ],
  [
    '#applyChange takes back every write of a change that throws',
    async (store) => {
      const workers = brandSchemas.limitName.parse('workers');
      const filed = buildMockV1ItemRow();
      const claimed = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: claimed.id, state: 'starting' });
      const fileChange = buildMockFileItemChange(filed);
      const claim = buildMockClaimChange(attempt, [workers]);
      const reusedFactId: StoreChange = { ...claim, facts: [...claim.facts, ...fileChange.facts] };

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: workers, max: 1, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(fileChange);
        await transaction.applyChange(buildMockFileItemChange(claimed));
        await transaction.applyChange(reusedFactId).catch(() => null);
      });

      const state: unknown = await store.read(async (transaction) => ({
        attempt: await transaction.readAttempt(attempt.id),
        seats: await transaction.listLimitSeats(),
      }));

      return { received: state, expected: { attempt: null, seats: [] } };
    },
  ],
  [
    '#applyChange keeps a heartbeat started beside a change it refuses',
    async (store) => {
      const filed = buildMockV1ItemRow();
      const missing = buildMockV1ItemRow();
      const runner = brandSchemas.runnerId.parse('runner-1');

      await store.exclusive((transaction) =>
        Promise.all([
          transaction.applyChange({
            at: brandSchemas.instant.parse(3000),
            writes: [
              { op: 'insert', table: 'items', row: filed },
              {
                op: 'update',
                table: 'items',
                key: { id: missing.id },
                expect: {},
                set: { title: 'Mend the gate' },
              },
            ],
            facts: [
              {
                id: buildMockFactId(),
                type: 'boxxy.item.edited',
                entity: `boxxy:item:${missing.id}`,
                actor: 'boxxy:owner:local',
                payload: { title: 'Mend the gate', byAttempt: null },
              },
            ],
          }),
          transaction
            .listLimits()
            .then(() => transaction.writeHeartbeat(runner, brandSchemas.instant.parse(1000))),
        ]),
      );

      const read: unknown = await store.read((transaction) => transaction.readRunner(runner));

      return { received: read, expected: { id: 'runner-1', heartbeatAt: 1000, paused: false } };
    },
  ],
  [
    '#applyChange runs two changes started together on one call one at a time',
    async (store) => {
      const claimed = buildMockV1ItemRow();
      const later = buildMockV1ItemRow();
      const first = buildMockV1AttemptRow({ item: claimed.id, state: 'starting', leaseGen: 1 });

      const second = buildMockV1AttemptRow({
        item: claimed.id,
        state: 'starting',
        leaseGen: 2,
        number: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(claimed));
        await transaction.applyChange(buildMockClaimChange(first));
      });

      const results = await store.exclusive((transaction) =>
        Promise.all([
          transaction.applyChange(buildMockClaimChange(second)),
          transaction.applyChange(buildMockFileItemChange(later)),
        ]),
      );

      const read = await store.read((transaction) =>
        transaction.readItem(later.id, brandSchemas.instant.parse(5000), new Map()),
      );

      return {
        received: { results, item: read?.id },
        expected: {
          results: [{ kind: 'lease-held' }, { kind: 'applied' }],
          item: later.id,
        },
      };
    },
  ],
];
