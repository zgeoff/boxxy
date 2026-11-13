import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { ItemId, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockV1LeverRow } from '@boxxy/model/test-utils/build-mock-v1-lever-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockLeverChange } from './build-mock-lever-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreHeldItemCases: readonly ClaimStoreCase[] = [
  [
    '#listItems with the state held returns the item whose held lever has no release after it',
    async (store) => {
      const held = buildMockV1ItemRow();
      const released = buildMockV1ItemRow();
      const open = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(held));
        await transaction.applyChange(buildMockFileItemChange(released));
        await transaction.applyChange(buildMockFileItemChange(open));
        await transaction.applyChange(buildHeldChange(held.id, 1));
        await transaction.applyChange(buildHeldChange(released.id, 2));
        await transaction.applyChange(buildReleaseChange(released.id, 3));
      });

      const listed = await store.read((transaction) =>
        transaction.listItems(
          { state: 'held' },
          brandSchemas.instant.parse(5000),
          buildMockItemRules(),
        ),
      );

      return {
        received: listed.map((item) => [item.id, item.derived]),
        expected: [[held.id, { state: 'held', reason: 'a draft to finish' }]],
      };
    },
  ],
  [
    '#readItemDetail returns the edit facts of a held item as revisions, oldest first',
    async (store) => {
      const item = buildMockV1ItemRow();
      const other = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockFileItemChange(other));
        await transaction.applyChange(buildHeldChange(item.id, 1));
        await transaction.applyChange(buildTitleEditChange(item.id, 4100, 'A first title'));
        await transaction.applyChange(buildTitleEditChange(other.id, 4200, 'Another title'));
        await transaction.applyChange(buildTitleEditChange(item.id, 4300, 'A second title'));
      });

      const detail = await store.read((transaction) =>
        transaction.readItemDetail(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: detail?.revisions,
        expected: [
          { seq: expect.any(Number), at: 4100, actor: 'boxxy:owner:local', changed: ['title'] },
          { seq: expect.any(Number), at: 4300, actor: 'boxxy:owner:local', changed: ['title'] },
        ],
      };
    },
  ],
];

function buildHeldChange(item: ItemId, seq: number): StoreChange {
  return buildMockLeverChange(
    buildMockV1LeverRow({
      seq,
      item,
      kind: 'item.held',
      reason: 'a draft to finish',
      at: brandSchemas.instant.parse(4000 + seq),
    }),
  );
}

function buildReleaseChange(item: ItemId, seq: number): StoreChange {
  return buildMockLeverChange(
    buildMockV1LeverRow({
      seq,
      item,
      kind: 'item.release',
      reason: null,
      at: brandSchemas.instant.parse(4000 + seq),
    }),
  );
}

function buildTitleEditChange(item: ItemId, at: number, title: string): StoreChange {
  return {
    at: brandSchemas.instant.parse(at),
    writes: [{ op: 'update', table: 'items', key: { id: item }, expect: {}, set: { title } }],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.item.edited',
        entity: `boxxy:item:${item}`,
        actor: 'boxxy:owner:local',
        payload: { title, byAttempt: null },
      },
    ],
  };
}
