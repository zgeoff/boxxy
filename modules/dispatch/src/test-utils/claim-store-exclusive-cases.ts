import { expect } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { brandSchemas } from '@boxxy/model';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreExclusiveCases: readonly ClaimStoreCase[] = [
  [
    '#exclusive runs two calls started together one at a time',
    async (store) => {
      const events: string[] = [];
      const gate = Promise.withResolvers<void>();

      const first = store.exclusive(async () => {
        events.push('first start');

        await gate.promise;

        events.push('first end');
      });

      const second = store.exclusive(() => {
        events.push('second start');

        return Promise.resolve();
      });

      // one turn of the event loop lets a store that doesn't wait start the second call
      await setImmediate();

      gate.resolve();

      await Promise.all([first, second]);

      expect(events).toStrictEqual(['first start', 'first end', 'second start']);
    },
  ],
  [
    '#exclusive leaves the state as it was when work throws',
    async (store) => {
      const item = buildMockItemRow();

      const writing = store.exclusive(async (tx) => {
        await tx.applyChange(buildMockFileItemChange(item));

        throw new Error('the work failed');
      });

      await writing.catch(() => null);

      const snapshot: unknown = await store.read((tx) =>
        tx.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      expect(snapshot).toStrictEqual({
        storeVersion: 0,
        items: [],
        links: [],
        levers: [],
        freeSlots: {},
      });
    },
  ],
  [
    '#exclusive rejects with the error work throws',
    async (store) => {
      const writing = store.exclusive(() => {
        throw new Error('the work failed');
      });

      await writing.catch(() => null);

      expect(writing).rejects.toThrow('the work failed');
    },
  ],
  [
    '#exclusive runs a later call after an earlier call throws',
    async (store) => {
      const item = buildMockItemRow();

      const failing = store.exclusive(() => {
        throw new Error('the work failed');
      });

      await failing.catch(() => null);
      await store.exclusive((tx) => tx.applyChange(buildMockFileItemChange(item)));

      const read = await store.read((tx) =>
        tx.readItem(item.id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(read?.id).toBe(item.id);
    },
  ],
  [
    '#read during a running exclusive call sees the last committed state',
    async (store) => {
      const committed = buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) });
      const pending = buildMockItemRow({ filedAt: brandSchemas.instant.parse(2000) });
      const gate = Promise.withResolvers<void>();
      const written = Promise.withResolvers<void>();

      await store.exclusive((tx) => tx.applyChange(buildMockFileItemChange(committed)));

      const writing = store.exclusive(async (tx) => {
        await tx.applyChange(buildMockFileItemChange(pending));

        written.resolve();

        await gate.promise;
      });

      await written.promise;

      const seen = await store.read((tx) =>
        tx.listItems({}, brandSchemas.instant.parse(5000), new Map()),
      );

      gate.resolve();

      await writing;

      expect(seen.map((item) => item.id)).toStrictEqual([committed.id]);
    },
  ],
  [
    '#applyChange writes the rows and the outbox facts of a change',
    async (store) => {
      const item = buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) });
      const change = buildMockFileItemChange(item);

      await store.exclusive((tx) => tx.applyChange(change));

      const facts: unknown = await store.read((tx) => tx.readUnsentFacts(10));

      expect(facts).toStrictEqual([
        {
          seq: 1,
          factId: change.facts[0]?.id,
          type: 'boxxy.item.filed',
          entity: `boxxy:item:${item.id}`,
          actor: 'boxxy:owner:local',
          at: 1000,
          payload: { ...item },
          sentAt: null,
        },
      ]);
    },
  ],
  [
    '#applyChange returns applied with no slot for a change that takes none',
    async (store) => {
      const change = buildMockFileItemChange(buildMockItemRow());

      const result = await store.exclusive((tx) => tx.applyChange(change));

      expect(result).toStrictEqual({ kind: 'applied', slot: null });
    },
  ],
];
