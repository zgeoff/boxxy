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

      return { received: events, expected: ['first start', 'first end', 'second start'] };
    },
  ],
  [
    '#exclusive leaves the state as it was when work throws',
    async (store) => {
      const item = buildMockItemRow();

      const writing = store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        throw new Error('the work failed');
      });

      await writing.catch(() => null);

      const snapshot: unknown = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      return {
        received: snapshot,
        expected: {
          storeVersion: 0,
          items: [],
          links: [],
          levers: [],
          freeSlots: {},
        },
      };
    },
  ],
  [
    '#exclusive rejects with the error work throws',
    async (store) => {
      const writing = store.exclusive(() => {
        throw new Error('the work failed');
      });

      const settled = await writing.then(
        () => 'resolved',
        (error: unknown) => error,
      );

      return { received: settled, expected: new Error('the work failed') };
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

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(item)),
      );

      const read = await store.read((transaction) =>
        transaction.readItem(item.id, brandSchemas.instant.parse(5000), new Map()),
      );

      return { received: read?.id, expected: item.id };
    },
  ],
  [
    '#read during a running exclusive call sees the last committed state',
    async (store) => {
      const committed = buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) });
      const pending = buildMockItemRow({ filedAt: brandSchemas.instant.parse(2000) });
      const gate = Promise.withResolvers<void>();
      const written = Promise.withResolvers<void>();

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(committed)),
      );

      const writing = store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(pending));

        written.resolve();

        await gate.promise;
      });

      await written.promise;

      const seen = await store.read((transaction) =>
        transaction.listItems({}, brandSchemas.instant.parse(5000), new Map()),
      );

      gate.resolve();

      await writing;

      return { received: seen.map((item) => item.id), expected: [committed.id] };
    },
  ],
  [
    '#read keeps one snapshot across a commit made during the call',
    async (store) => {
      const committed = buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) });
      const later = buildMockItemRow({ filedAt: brandSchemas.instant.parse(2000) });

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(committed)),
      );

      const seen: unknown = await store.read(async (transaction) => {
        const before = await transaction.listItems({}, brandSchemas.instant.parse(5000), new Map());

        await store.exclusive((writer) => writer.applyChange(buildMockFileItemChange(later)));

        const after = await transaction.listItems({}, brandSchemas.instant.parse(5000), new Map());

        return { before: before.map((item) => item.id), after: after.map((item) => item.id) };
      });

      return { received: seen, expected: { before: [committed.id], after: [committed.id] } };
    },
  ],
  [
    '#read runs a read started inside another read',
    async (store) => {
      const item = buildMockItemRow();

      await store.exclusive((transaction) =>
        transaction.applyChange(buildMockFileItemChange(item)),
      );

      const seen = await store.read(() =>
        store.read((transaction) =>
          transaction.readItem(item.id, brandSchemas.instant.parse(5000), new Map()),
        ),
      );

      return { received: seen?.id, expected: item.id };
    },
  ],
  [
    '#applyChange writes the rows and the outbox facts of a change',
    async (store) => {
      const item = buildMockItemRow({ filedAt: brandSchemas.instant.parse(1000) });
      const change = buildMockFileItemChange(item);

      await store.exclusive((transaction) => transaction.applyChange(change));

      const facts: unknown = await store.read((transaction) => transaction.readUnsentFacts(10));

      return {
        received: facts,
        expected: [
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
        ],
      };
    },
  ],
  [
    '#applyChange returns applied with no slot for a change that takes none',
    async (store) => {
      const change = buildMockFileItemChange(buildMockItemRow());

      const result = await store.exclusive((transaction) => transaction.applyChange(change));

      return { received: result, expected: { kind: 'applied', slot: null } };
    },
  ],
];
