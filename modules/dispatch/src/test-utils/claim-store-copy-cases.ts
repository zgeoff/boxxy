import { brandSchemas } from '@boxxy/model';
import type { Criterion } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockStartChange } from './build-mock-start-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreCopyCases: readonly ClaimStoreCase[] = [
  [
    '#readAttempt returns a row that a later change in the same call leaves as it was',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
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
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
      });

      const read = await store.read((transaction) => transaction.readAttempt(attempt.id));

      Object.assign(read ?? {}, { state: 'failed' });

      const reread = await store.read((transaction) => transaction.readAttempt(attempt.id));

      return { received: reread?.state, expected: 'starting' };
    },
  ],
  [
    '#applyChange stores a copy of a list that an update sets',
    async (store) => {
      const item = buildMockV1ItemRow();

      const acceptance: Criterion[] = [
        { id: brandSchemas.criterionId.parse('a1'), text: 'The gate latches', evidence: [] },
      ];

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange({
          at: brandSchemas.instant.parse(3000),
          writes: [
            { op: 'update', table: 'items', key: { id: item.id }, expect: {}, set: { acceptance } },
          ],
          facts: [
            {
              id: buildMockFactId(),
              type: 'boxxy.item.edited',
              entity: `boxxy:item:${item.id}`,
              actor: 'boxxy:owner:local',
              payload: { acceptance: [...acceptance], byAttempt: null },
            },
          ],
        });
      });

      acceptance.push({
        id: brandSchemas.criterionId.parse('a2'),
        text: 'The hinge is oiled',
        evidence: [],
      });

      const reread = await store.read((transaction) =>
        transaction.readItem(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: reread?.acceptance,
        expected: [{ id: 'a1', text: 'The gate latches', evidence: [] }],
      };
    },
  ],
];
