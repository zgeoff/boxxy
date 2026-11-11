import { setImmediate } from 'node:timers/promises';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreCloseCases: readonly ClaimStoreCase[] = [
  [
    '#read rejects after the store closes',
    async (store) => {
      await store.close();

      const settled = await store
        .read((transaction) => transaction.listPoolSlots())
        .then(
          () => 'resolved',
          () => 'rejected',
        );

      return { received: settled, expected: 'rejected' };
    },
  ],
  [
    '#exclusive rejects after the store closes',
    async (store) => {
      await store.close();

      const settled = await store
        .exclusive((transaction) => transaction.listPoolSlots())
        .then(
          () => 'resolved',
          () => 'rejected',
        );

      return { received: settled, expected: 'rejected' };
    },
  ],
  [
    '#close waits for a read that is running',
    async (store) => {
      const events: string[] = [];
      const gate = Promise.withResolvers<void>();

      const reading = store.read(async () => {
        await gate.promise;

        events.push('read end');
      });

      const close = async () => {
        await store.close();

        events.push('close end');
      };

      const closing = close();

      // one turn of the event loop lets a store that doesn't wait finish the close
      await setImmediate();

      gate.resolve();

      await Promise.all([reading, closing]);

      return { received: events, expected: ['read end', 'close end'] };
    },
  ],
  [
    '#close waits for an exclusive call that is running',
    async (store) => {
      const events: string[] = [];
      const gate = Promise.withResolvers<void>();

      const writing = store.exclusive(async () => {
        await gate.promise;

        events.push('exclusive end');
      });

      const close = async () => {
        await store.close();

        events.push('close end');
      };

      const closing = close();

      // one turn of the event loop lets a store that doesn't wait finish the close
      await setImmediate();

      gate.resolve();

      await Promise.all([writing, closing]);

      return { received: events, expected: ['exclusive end', 'close end'] };
    },
  ],
];
