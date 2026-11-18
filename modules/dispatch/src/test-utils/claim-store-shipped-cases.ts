import { brandSchemas } from '@boxxy/model';
import type { ItemShipped } from '@boxxy/model';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockShippedChange } from './build-mock-shipped-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreShippedCases: readonly ClaimStoreCase[] = [
  [
    '#listShipped returns the rows of one item, oldest seen first, with an absent release left out',
    async (store) => {
      const item = buildMockV1ItemRow();
      const other = buildMockV1ItemRow();

      const later = buildShipped(item.id, 2000, {
        commit: brandSchemas.commitSha.parse('b2'.repeat(20)),
        rule: 'release-then-deploy',
        ref: 'deployed/prod/service',
        release: 'v1.1.0',
      });

      const earlier = buildShipped(item.id, 1000);

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockFileItemChange(other));
        await transaction.applyChange(buildMockShippedChange(later));
        await transaction.applyChange(buildMockShippedChange(earlier));
        await transaction.applyChange(buildMockShippedChange(buildShipped(other.id, 1500)));
      });

      const listed: unknown = await store.read((transaction) => transaction.listShipped(item.id));

      return { received: listed, expected: [earlier, later] };
    },
  ],
  [
    '#readItemDetail returns the shipped rows of the item',
    async (store) => {
      const item = buildMockV1ItemRow();
      const shipped = buildShipped(item.id, 1000);

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockShippedChange(shipped));
      });

      const detail = await store.read((transaction) =>
        transaction.readItemDetail(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return { received: detail?.shipped, expected: [shipped] };
    },
  ],
  [
    '#applyChange writes the shipped fact in the change of the row',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockShippedChange(buildShipped(item.id, 1000)));
      });

      const facts = await store.read((transaction) => transaction.readUnsentFacts(10));

      return {
        received: facts.map((fact) => fact.type),
        expected: ['boxxy.item.filed', 'boxxy.item.shipped'],
      };
    },
  ],
  [
    '#applyChange rejects a second shipped row for one item and commit, and writes no second fact',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockShippedChange(buildShipped(item.id, 1000)));
      });

      const second = await store
        .exclusive((transaction) =>
          transaction.applyChange(buildMockShippedChange(buildShipped(item.id, 2000))),
        )
        .then(
          () => 'resolved',
          () => 'rejected',
        );

      const facts = await store.read((transaction) => transaction.readUnsentFacts(10));

      return { received: [second, facts.length], expected: ['rejected', 2] };
    },
  ],
  [
    '#listUnsentNotices returns a notify notice with its phase and reason',
    async (store) => {
      const item = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange({
          at: brandSchemas.instant.parse(1000),
          writes: [
            {
              op: 'insert',
              table: 'notices',
              row: {
                id: 1,
                kind: 'notify',
                item: item.id,
                phase: brandSchemas.phaseName.parse('live'),
                reason: 'wait-skip:shipped',
                pause: null,
                at: brandSchemas.instant.parse(1000),
                tries: 0,
                sentAt: null,
                keySeq: 0,
                keyTries: 0,
                nextTryAt: brandSchemas.instant.parse(1000),
              },
            },
          ],
          facts: [],
        });
      });

      const unsent = await store.read((transaction) => transaction.listUnsentNotices(10));

      return {
        received: unsent.map((row) => [row.kind, row.item, row.phase, row.reason]),
        expected: [['notify', item.id, 'live', 'wait-skip:shipped']],
      };
    },
  ],
];

function buildShipped(item: ItemShipped['itemId'], seenAt: number, rest = {}): ItemShipped {
  return {
    itemId: item,
    commit: brandSchemas.commitSha.parse('a1'.repeat(20)),
    rule: 'release',
    ref: 'v1.0.0',
    seenAt: brandSchemas.instant.parse(seenAt),
    ...rest,
  };
}
