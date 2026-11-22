import { brandSchemas } from '@boxxy/model';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreItemLookupCases: readonly ClaimStoreCase[] = [
  [
    '#readItemIdByRef and #readItemRef number each filed item from i-1 in filing order, and skip no number after a close',
    async (store) => {
      const first = buildMockV1ItemRow();
      const second = buildMockV1ItemRow();
      const third = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(first));
        await transaction.applyChange(buildMockFileItemChange(second));

        await transaction.applyChange({
          at: brandSchemas.instant.parse(4000),
          writes: [
            {
              op: 'update',
              table: 'items',
              key: { id: second.id },
              expect: { closedAt: null },
              set: {
                closedAt: brandSchemas.instant.parse(4000),
                closeReason: 'done',
              },
            },
          ],
          facts: [],
        });

        await transaction.applyChange(buildMockFileItemChange(third));
      });

      const read = await store.read(async (transaction) => ({
        refs: [
          await transaction.readItemRef(first.id),
          await transaction.readItemRef(second.id),
          await transaction.readItemRef(third.id),
          await transaction.readItemRef(buildMockV1ItemRow().id),
        ],
        ids: [
          await transaction.readItemIdByRef(brandSchemas.itemRef.parse('i-1')),
          await transaction.readItemIdByRef(brandSchemas.itemRef.parse('i-2')),
          await transaction.readItemIdByRef(brandSchemas.itemRef.parse('i-3')),
          await transaction.readItemIdByRef(brandSchemas.itemRef.parse('i-4')),
        ],
      }));

      return {
        received: read,
        expected: {
          refs: ['i-1', 'i-2', 'i-3', null],
          ids: [first.id, second.id, third.id, null],
        },
      };
    },
  ],
  [
    '#readItem returns null for an unknown item',
    async (store) => {
      const read = await store.read((transaction) =>
        transaction.readItem(
          buildMockV1ItemRow().id,
          brandSchemas.instant.parse(5000),
          buildMockItemRules(),
        ),
      );

      return { received: read, expected: null };
    },
  ],
];
