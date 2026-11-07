import { brandSchemas } from '@boxxy/model';
import type { StoreChange } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreRollbackCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange refuses a settle whose slot release names another holder whole',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });
      const other = buildMockAttemptRow();

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const settle = buildMockSettleChange({
        attempt: { ...attempt, slot: 1, slotGen: 1 },
        state: 'succeeded',
      });

      const misnamed: StoreChange = {
        ...settle,
        writes: [
          ...settle.writes.filter((write) => write.op !== 'release-slot'),
          { op: 'release-slot', pool: attempt.pool, slot: 1, holder: other.id },
        ],
      };

      const result = await store.exclusive((transaction) => transaction.applyChange(misnamed));

      const state: unknown = await store.read(async (transaction) => {
        const read = await transaction.readAttempt(attempt.id);
        const facts = await transaction.readUnsentFacts(10);

        const view = await transaction.readItem(
          item.id,
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        return { attempt: read?.state, facts: facts.length, item: view?.derived };
      });

      return {
        received: { result, state },
        expected: {
          result: { kind: 'stale-generation' },
          state: { attempt: 'starting', facts: 2, item: { state: 'running' } },
        },
      };
    },
  ],
  [
    '#applyChange takes back every write of a change that throws',
    async (store) => {
      const filed = buildMockItemRow();
      const claimed = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: claimed.id, state: 'starting' });
      const fileChange = buildMockFileItemChange(filed);
      const claim = buildMockClaimChange(attempt);
      const reusedFactId: StoreChange = { ...claim, facts: [...claim.facts, ...fileChange.facts] };

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(fileChange);
        await transaction.applyChange(buildMockFileItemChange(claimed));
        await transaction.applyChange(reusedFactId).catch(() => null);
      });

      const state: unknown = await store.read(async (transaction) => ({
        attempt: await transaction.readAttempt(attempt.id),
        slots: await transaction.listPoolSlots(),
      }));

      return {
        received: state,
        expected: {
          attempt: null,
          slots: [{ pool: attempt.pool, slot: 1, holder: null, gen: 0, retired: false }],
        },
      };
    },
  ],
  [
    '#applyChange keeps a heartbeat started beside a change it refuses',
    async (store) => {
      const filed = buildMockItemRow();
      const missing = buildMockItemRow();
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
                payload: { title: 'Mend the gate' },
              },
            ],
          }),
          transaction
            .listPoolSlots()
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
      const claimed = buildMockItemRow();
      const later = buildMockItemRow();
      const first = buildMockAttemptRow({ item: claimed.id, state: 'starting', leaseGen: 1 });

      const second = buildMockAttemptRow({
        item: claimed.id,
        state: 'starting',
        leaseGen: 2,
        number: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: first.pool, slots: 2 }]);
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
          results: [{ kind: 'lease-held' }, { kind: 'applied', slot: null }],
          item: later.id,
        },
      };
    },
  ],
];
