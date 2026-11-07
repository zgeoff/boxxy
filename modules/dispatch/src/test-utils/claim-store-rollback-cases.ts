import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { StoreChange } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
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

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));
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

      const result = await store.exclusive((tx) => tx.applyChange(misnamed));

      const state: unknown = await store.read(async (tx) => {
        const read = await tx.readAttempt(attempt.id);
        const facts = await tx.readUnsentFacts(10);
        const view = await tx.readItem(item.id, brandSchemas.instant.parse(5000), new Map());

        return { attempt: read?.state, facts: facts.length, item: view?.derived };
      });

      expect({ result, state }).toStrictEqual({
        result: { kind: 'stale-generation' },
        state: { attempt: 'starting', facts: 2, item: { state: 'running' } },
      });
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

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(fileChange);
        await tx.applyChange(buildMockFileItemChange(claimed));
        await tx.applyChange(reusedFactId).catch(() => null);
      });

      const state: unknown = await store.read(async (tx) => ({
        attempt: await tx.readAttempt(attempt.id),
        slots: await tx.listPoolSlots(),
      }));

      expect(state).toStrictEqual({
        attempt: null,
        slots: [{ pool: attempt.pool, slot: 1, holder: null, gen: 0, retired: false }],
      });
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

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: first.pool, slots: 2 }]);
        await tx.applyChange(buildMockFileItemChange(claimed));
        await tx.applyChange(buildMockClaimChange(first));
      });

      const results = await store.exclusive((tx) =>
        Promise.all([
          tx.applyChange(buildMockClaimChange(second)),
          tx.applyChange(buildMockFileItemChange(later)),
        ]),
      );

      const read = await store.read((tx) =>
        tx.readItem(later.id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect({ results, item: read?.id }).toStrictEqual({
        results: [{ kind: 'lease-held' }, { kind: 'applied', slot: null }],
        item: later.id,
      });
    },
  ],
];
