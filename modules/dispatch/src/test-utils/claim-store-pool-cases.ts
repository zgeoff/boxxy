import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStorePoolCases: readonly ClaimStoreCase[] = [
  [
    '#syncPoolSlots adds a row for each slot of each pool',
    async (store) => {
      await store.exclusive((tx) =>
        tx.syncPoolSlots([
          { name: brandSchemas.poolName.parse('build'), slots: 2 },
          { name: brandSchemas.poolName.parse('review'), slots: 1 },
        ]),
      );

      const slots: unknown = await store.read((tx) => tx.listPoolSlots());

      expect(slots).toStrictEqual([
        { pool: 'build', slot: 1, holder: null, gen: 0, retired: false },
        { pool: 'build', slot: 2, holder: null, gen: 0, retired: false },
        { pool: 'review', slot: 1, holder: null, gen: 0, retired: false },
      ]);
    },
  ],
  [
    '#syncPoolSlots retires the rows above a smaller count and deletes none',
    async (store) => {
      const pool = brandSchemas.poolName.parse('build');

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: pool, slots: 3 }]);
        await tx.syncPoolSlots([{ name: pool, slots: 1 }]);
      });

      const slots = await store.read((tx) => tx.listPoolSlots());

      const retired: unknown = slots.map((slot) => [slot.slot, slot.retired]);

      expect(retired).toStrictEqual([
        [1, false],
        [2, true],
        [3, true],
      ]);
    },
  ],
  [
    '#syncPoolSlots retires every row of a pool the rules no longer name',
    async (store) => {
      const build = brandSchemas.poolName.parse('build');
      const review = brandSchemas.poolName.parse('review');

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([
          { name: build, slots: 1 },
          { name: review, slots: 2 },
        ]);

        await tx.syncPoolSlots([{ name: build, slots: 1 }]);
      });

      const slots = await store.read((tx) => tx.listPoolSlots());

      const retired: unknown = slots.map((slot) => [slot.pool, slot.slot, slot.retired]);

      expect(retired).toStrictEqual([
        ['build', 1, false],
        ['review', 1, true],
        ['review', 2, true],
      ]);
    },
  ],
  [
    '#syncPoolSlots leaves the holder on a slot it retires',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const lower = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const upper = buildMockAttemptRow({ item: second.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: lower.pool, slots: 2 }]);
        await tx.applyChange(buildMockFileItemChange(first));
        await tx.applyChange(buildMockFileItemChange(second));
        await tx.applyChange(buildMockClaimChange(lower));
        await tx.applyChange(buildMockClaimChange(upper));
        await tx.syncPoolSlots([{ name: lower.pool, slots: 1 }]);
      });

      const slots = await store.read((tx) => tx.listPoolSlots());

      expect(slots[1]).toStrictEqual({
        pool: upper.pool,
        slot: 2,
        holder: upper.id,
        gen: 1,
        retired: true,
      });
    },
  ],
  [
    '#applyChange never takes a retired slot',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const held = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const refused = buildMockAttemptRow({ item: second.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: held.pool, slots: 2 }]);
        await tx.syncPoolSlots([{ name: held.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(first));
        await tx.applyChange(buildMockFileItemChange(second));
        await tx.applyChange(buildMockClaimChange(held));
      });

      const result = await store.exclusive((tx) => tx.applyChange(buildMockClaimChange(refused)));

      expect(result).toStrictEqual({ kind: 'no-free-slot' });
    },
  ],
  [
    '#syncPoolSlots reuses a retired row with its gen when the pool grows again',
    async (store) => {
      const first = buildMockItemRow();
      const second = buildMockItemRow();
      const third = buildMockItemRow();
      const lower = buildMockAttemptRow({ item: first.id, state: 'starting' });
      const upper = buildMockAttemptRow({ item: second.id, state: 'starting' });
      const later = buildMockAttemptRow({ item: third.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: lower.pool, slots: 2 }]);
        await tx.applyChange(buildMockFileItemChange(first));
        await tx.applyChange(buildMockFileItemChange(second));
        await tx.applyChange(buildMockFileItemChange(third));
        await tx.applyChange(buildMockClaimChange(lower));
        await tx.applyChange(buildMockClaimChange(upper));

        await tx.applyChange(
          buildMockSettleChange({ attempt: { ...upper, slot: 2, slotGen: 1 }, state: 'failed' }),
        );

        await tx.syncPoolSlots([{ name: lower.pool, slots: 1 }]);
        await tx.syncPoolSlots([{ name: lower.pool, slots: 2 }]);
      });

      const result = await store.exclusive((tx) => tx.applyChange(buildMockClaimChange(later)));

      expect(result).toStrictEqual({
        kind: 'applied',
        slot: { pool: later.pool, slot: 2, gen: 2 },
      });
    },
  ],
];
