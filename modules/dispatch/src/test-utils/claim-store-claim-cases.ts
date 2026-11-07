import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockLeverRow } from '@boxxy/model/test-utils/build-mock-lever-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockLeverChange } from './build-mock-lever-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreClaimCases: readonly ClaimStoreCase[] = [
  [
    '#applyChange returns lease-held for a second live lease on one item phase',
    async (store) => {
      const item = buildMockItemRow();
      const first = buildMockAttemptRow({ item: item.id, state: 'starting', leaseGen: 1 });

      const second = buildMockAttemptRow({
        item: item.id,
        state: 'starting',
        leaseGen: 2,
        number: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: first.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(first));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockClaimChange(second)),
      );

      expect(result).toStrictEqual({ kind: 'lease-held' });
    },
  ],
  [
    '#applyChange writes no row of a change that returns lease-held',
    async (store) => {
      const item = buildMockItemRow();
      const first = buildMockAttemptRow({ item: item.id, state: 'starting', leaseGen: 1 });

      const second = buildMockAttemptRow({
        item: item.id,
        state: 'starting',
        leaseGen: 2,
        number: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: first.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(first));
        await transaction.applyChange(buildMockClaimChange(second));
      });

      const state: unknown = await store.read(async (transaction) => {
        const snapshot = await transaction.readSnapshot(
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        return {
          attempt: await transaction.readAttempt(second.id),
          slots: await transaction.listPoolSlots(),
          lastGen: await transaction.readLastLeaseGen(item.id, first.phase),
          version: snapshot.storeVersion,
        };
      });

      expect(state).toStrictEqual({
        attempt: null,
        slots: [
          { pool: first.pool, slot: 1, holder: first.id, gen: 1, retired: false },
          { pool: first.pool, slot: 2, holder: null, gen: 0, retired: false },
        ],
        lastGen: 1,
        version: 2,
      });
    },
  ],
  [
    '#applyChange returns no-free-slot and changes no row when every slot is held',
    async (store) => {
      const held = buildMockItemRow();
      const waiting = buildMockItemRow();
      const first = buildMockAttemptRow({ item: held.id, state: 'starting' });
      const second = buildMockAttemptRow({ item: waiting.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: first.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(held));
        await transaction.applyChange(buildMockFileItemChange(waiting));
        await transaction.applyChange(buildMockClaimChange(first));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockClaimChange(second)),
      );

      const state: unknown = await store.read(async (transaction) => {
        const snapshot = await transaction.readSnapshot(
          brandSchemas.instant.parse(5000),
          new Map(),
        );

        return {
          attempt: await transaction.readAttempt(second.id),
          lastGen: await transaction.readLastLeaseGen(waiting.id, second.phase),
          version: snapshot.storeVersion,
        };
      });

      expect({ result, state }).toStrictEqual({
        result: { kind: 'no-free-slot' },
        state: { attempt: null, lastGen: 0, version: 3 },
      });
    },
  ],
  [
    '#applyChange gives a claim the lowest free slot and its new gen',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
      });

      const result = await store.exclusive((transaction) =>
        transaction.applyChange(buildMockClaimChange(attempt)),
      );

      expect(result).toStrictEqual({
        kind: 'applied',
        slot: { pool: attempt.pool, slot: 1, gen: 1 },
      });
    },
  ],
  [
    '#applyChange writes the taken slot and slot gen into the attempt row',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const read = await store.read((transaction) => transaction.readAttempt(attempt.id));

      expect(read).toStrictEqual({ ...attempt, slot: 1, slotGen: 1 });
    },
  ],
  [
    '#applyChange writes the taken slot and slot gen into the claimed fact',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const facts = await store.read((transaction) => transaction.readUnsentFacts(10));

      expect(facts[1]?.payload).toStrictEqual({
        item: item.id,
        phase: attempt.phase,
        number: attempt.number,
        pool: attempt.pool,
        slot: 1,
        gen: 1,
        recipeHash: attempt.recipeHash,
        rulesVersion: attempt.rulesVersion,
      });
    },
  ],
  [
    '#applyChange gives each lever insert its seq, in the row and the fact',
    async (store) => {
      const item = buildMockItemRow();
      const defer = buildMockLeverRow({ seq: 0, item: item.id, kind: 'plan.defer' });
      const expedite = buildMockLeverRow({ seq: 0, item: item.id, kind: 'plan.expedite' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockLeverChange(defer));
        await transaction.applyChange(buildMockLeverChange(expedite));
      });

      const state: unknown = await store.read(async (transaction) => {
        const items = await transaction.listItems({}, brandSchemas.instant.parse(5000), new Map());
        const facts = await transaction.readUnsentFacts(10);

        return { levers: items[0]?.levers, payloads: facts.slice(1).map((fact) => fact.payload) };
      });

      expect(state).toStrictEqual({
        levers: [
          { ...defer, seq: 1 },
          { ...expedite, seq: 2 },
        ],
        payloads: [
          { ...defer, seq: 1 },
          { ...expedite, seq: 2 },
        ],
      });
    },
  ],
];
