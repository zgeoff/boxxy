import { brandSchemas } from '@boxxy/model';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreOutboxCases: readonly ClaimStoreCase[] = [
  [
    '#markFactsSent drops the facts from the unsent facts and the counts',
    async (store) => {
      const first = buildMockFileItemChange(
        buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(1000) }),
      );

      const second = buildMockFileItemChange(
        buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(2000) }),
      );

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(first);
        await transaction.applyChange(second);
      });

      await store.exclusive((transaction) =>
        transaction.markFactsSent(
          first.facts.map((fact) => fact.id),
          brandSchemas.instant.parse(3000),
        ),
      );

      const outbox: unknown = await store.read(async (transaction) => {
        const unsent = await transaction.readUnsentFacts(10);

        return {
          unsent: unsent.map((fact) => fact.factId),
          counts: await transaction.readOutboxCounts(),
        };
      });

      return {
        received: outbox,
        expected: {
          unsent: second.facts.map((fact) => fact.id),
          counts: { unsent: 1, parked: 0, oldestUnsentAt: 2000 },
        },
      };
    },
  ],
  [
    '#readUnsentFacts returns at most the limit, oldest first',
    async (store) => {
      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(buildMockV1ItemRow()));
        await transaction.applyChange(buildMockFileItemChange(buildMockV1ItemRow()));
      });

      const unsent = await store.read((transaction) => transaction.readUnsentFacts(1));

      return { received: unsent.map((fact) => fact.seq), expected: [1] };
    },
  ],
  [
    '#readOutboxCounts reads no row from an empty outbox',
    async (store) => {
      const counts: unknown = await store.read((transaction) => transaction.readOutboxCounts());

      return { received: counts, expected: { unsent: 0, parked: 0, oldestUnsentAt: null } };
    },
  ],
  [
    '#readOutboxCounts reads the earliest time of the unsent facts, whatever their order',
    async (store) => {
      const later = buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(2000) });
      const earlier = buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(1000) });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(later));
        await transaction.applyChange(buildMockFileItemChange(earlier));
      });

      const counts: unknown = await store.read((transaction) => transaction.readOutboxCounts());

      return { received: counts, expected: { unsent: 2, parked: 0, oldestUnsentAt: 1000 } };
    },
  ],
  [
    '#parkFacts leaves a parked fact out of the unsent facts and counts it parked',
    async (store) => {
      const parked = buildMockFileItemChange(
        buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(1000) }),
      );

      const waiting = buildMockFileItemChange(
        buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(2000) }),
      );

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(parked);
        await transaction.applyChange(waiting);
      });

      await store.exclusive((transaction) =>
        transaction.parkFacts(
          parked.facts.map((fact) => fact.id),
          'too-large',
          brandSchemas.instant.parse(3000),
        ),
      );

      const outbox: unknown = await store.read(async (transaction) => {
        const unsent = await transaction.readUnsentFacts(10);

        return {
          unsent: unsent.map((fact) => fact.factId),
          counts: await transaction.readOutboxCounts(),
        };
      });

      return {
        received: outbox,
        expected: {
          unsent: waiting.facts.map((fact) => fact.id),
          counts: { unsent: 1, parked: 1, oldestUnsentAt: 2000 },
        },
      };
    },
  ],
  [
    '#markFactsSent leaves a parked fact parked',
    async (store) => {
      const change = buildMockFileItemChange(buildMockV1ItemRow());
      const ids = change.facts.map((fact) => fact.id);

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(change);
        await transaction.parkFacts(ids, 'unknown-type', brandSchemas.instant.parse(3000));
      });

      await store.exclusive((transaction) =>
        transaction.markFactsSent(ids, brandSchemas.instant.parse(4000)),
      );

      const counts: unknown = await store.read((transaction) => transaction.readOutboxCounts());

      return { received: counts, expected: { unsent: 0, parked: 1, oldestUnsentAt: null } };
    },
  ],
  [
    '#parkFacts leaves a sent fact as it is',
    async (store) => {
      const change = buildMockFileItemChange(buildMockV1ItemRow());
      const ids = change.facts.map((fact) => fact.id);

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(change);
        await transaction.markFactsSent(ids, brandSchemas.instant.parse(3000));
      });

      await store.exclusive((transaction) =>
        transaction.parkFacts(ids, 'too-large', brandSchemas.instant.parse(4000)),
      );

      const counts: unknown = await store.read((transaction) => transaction.readOutboxCounts());

      return { received: counts, expected: { unsent: 0, parked: 0, oldestUnsentAt: null } };
    },
  ],
  [
    '#unparkFacts clears every park mark, returns the count and the facts read unsent again',
    async (store) => {
      const first = buildMockFileItemChange(buildMockV1ItemRow());
      const second = buildMockFileItemChange(buildMockV1ItemRow());

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(first);
        await transaction.applyChange(second);

        await transaction.parkFacts(
          [...first.facts, ...second.facts].map((fact) => fact.id),
          'too-large',
          brandSchemas.instant.parse(3000),
        );
      });

      const cleared = await store.exclusive((transaction) => transaction.unparkFacts());
      const unsent = await store.read((transaction) => transaction.readUnsentFacts(10));

      return {
        received: { cleared, unsent: unsent.map((fact) => [fact.parkedAt, fact.parkedReason]) },
        expected: {
          cleared: 2,
          unsent: [
            [null, null],
            [null, null],
          ],
        },
      };
    },
  ],
  [
    '#readItemBehind counts the unsent facts of one item, parked ones too',
    async (store) => {
      const item = buildMockV1ItemRow({ filedAt: brandSchemas.instant.parse(1000) });
      const other = buildMockV1ItemRow();
      const filed = buildMockFileItemChange(item);

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(filed);
        await transaction.applyChange(buildMockFileItemChange(other));

        await transaction.parkFacts(
          filed.facts.map((fact) => fact.id),
          'too-large',
          brandSchemas.instant.parse(3000),
        );
      });

      const behind: unknown = await store.read((transaction) =>
        transaction.readItemBehind(item.id),
      );

      return { received: behind, expected: { facts: 1, oldestAt: 1000 } };
    },
  ],
  [
    '#readItemBehind reads nothing behind for an item whose facts are sent',
    async (store) => {
      const item = buildMockV1ItemRow();
      const filed = buildMockFileItemChange(item);

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(filed);

        await transaction.markFactsSent(
          filed.facts.map((fact) => fact.id),
          brandSchemas.instant.parse(3000),
        );
      });

      const behind: unknown = await store.read((transaction) =>
        transaction.readItemBehind(item.id),
      );

      return { received: behind, expected: { facts: 0, oldestAt: null } };
    },
  ],
  [
    '#markNoticeTried counts a failed try and keeps the notice unsent',
    async (store) => {
      const item = buildMockV1ItemRow();

      const notice = {
        id: 0,
        item: item.id,
        reason: 'attempts used up',
        at: brandSchemas.instant.parse(3000),
        tries: 0,
        sentAt: null,
      } as const;

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange({
          at: notice.at,
          writes: [
            { op: 'insert', table: 'notices', row: notice },
            { op: 'insert', table: 'notices', row: notice },
          ],
          facts: [],
        });

        await transaction.markNoticeTried(1, brandSchemas.instant.parse(3500), false);
        await transaction.markNoticeTried(2, brandSchemas.instant.parse(3500), true);
      });

      const unsent: unknown = await store.read((transaction) => transaction.listUnsentNotices(10));

      return { received: unsent, expected: [{ ...notice, id: 1, tries: 1 }] };
    },
  ],
  [
    '#listNoticesToSend leaves out a sent notice and one that used all its tries',
    async (store) => {
      const item = buildMockV1ItemRow();

      const notice = {
        id: 0,
        item: item.id,
        reason: 'attempts used up',
        at: brandSchemas.instant.parse(3000),
        tries: 0,
        sentAt: null,
      } as const;

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        await transaction.applyChange({
          at: notice.at,
          writes: [
            { op: 'insert', table: 'notices', row: { ...notice, tries: 5 } },
            { op: 'insert', table: 'notices', row: notice },
            { op: 'insert', table: 'notices', row: { ...notice, tries: 4 } },
            { op: 'insert', table: 'notices', row: notice },
          ],
          facts: [],
        });

        await transaction.markNoticeTried(4, brandSchemas.instant.parse(3500), true);
      });

      const toSend: unknown = await store.read((transaction) =>
        transaction.listNoticesToSend(5, 10),
      );

      return {
        received: toSend,
        expected: [
          { ...notice, id: 2 },
          { ...notice, id: 3, tries: 4 },
        ],
      };
    },
  ],
];
