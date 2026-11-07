import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockStartChange } from './build-mock-start-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreCopyCases: readonly ClaimStoreCase[] = [
  [
    '#readAttempt returns a row that a later change in the same call leaves as it was',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const before = await store.exclusive(async (transaction) => {
        const read = await transaction.readAttempt(attempt.id);

        await transaction.applyChange(buildMockStartChange(attempt));

        return read;
      });

      return { received: before?.state, expected: 'starting' };
    },
  ],
  [
    '#read returns rows whose edits by the caller leave the store as it was',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const read = await store.read((transaction) => transaction.readAttempt(attempt.id));

      Object.assign(read ?? {}, { state: 'failed' });

      const reread = await store.read((transaction) => transaction.readAttempt(attempt.id));

      return { received: reread?.state, expected: 'starting' };
    },
  ],
];
