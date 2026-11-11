import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockPullRequestChange } from './build-mock-pull-request-change.ts';
import { buildMockRelationChange } from './build-mock-relation-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreItemReaderCases: readonly ClaimStoreCase[] = [
  [
    '#readSnapshot holds the open items, the store version and the free slots',
    async (store) => {
      const open = buildMockItemRow();
      const archived = buildMockItemRow({ closedAt: brandSchemas.instant.parse(1500) });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: brandSchemas.poolName.parse('build'), slots: 2 }]);
        await transaction.applyChange(buildMockFileItemChange(open));
        await transaction.applyChange(buildMockFileItemChange(archived));
      });

      const snapshot: unknown = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      return {
        received: snapshot,
        expected: {
          storeVersion: 2,
          items: [{ ...open, derived: { state: 'ready' } }],
          relations: [],
          levers: [],
          freeSlots: { build: 2 },
        },
      };
    },
  ],
  [
    '#readSnapshot drops a done item',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.applyChange(
          buildMockSettleChange({
            attempt: { ...attempt, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'merged' }));
      });

      const snapshot = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      return { received: snapshot.items, expected: [] };
    },
  ],
  [
    '#readItem returns null for an unknown item',
    async (store) => {
      const read = await store.read((transaction) =>
        transaction.readItem(buildMockItemRow().id, brandSchemas.instant.parse(5000), new Map()),
      );

      return { received: read, expected: null };
    },
  ],
  [
    '#readItem derives blocked for the target of a live relation from a ready item',
    async (store) => {
      const source = buildMockItemRow();
      const target = buildMockItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(source));
        await transaction.applyChange(buildMockFileItemChange(target));

        await transaction.applyChange(
          buildMockRelationChange({ source: source.id, target: target.id }),
        );
      });

      const read = await store.read((transaction) =>
        transaction.readItem(target.id, brandSchemas.instant.parse(5000), new Map()),
      );

      return { received: read?.derived, expected: { state: 'blocked' } };
    },
  ],
  [
    '#readItem derives ready for the target of a relation from an archived item',
    async (store) => {
      const source = buildMockItemRow({ closedAt: brandSchemas.instant.parse(1500) });
      const target = buildMockItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(source));
        await transaction.applyChange(buildMockFileItemChange(target));

        await transaction.applyChange(
          buildMockRelationChange({ source: source.id, target: target.id }),
        );
      });

      const read = await store.read((transaction) =>
        transaction.readItem(target.id, brandSchemas.instant.parse(5000), new Map()),
      );

      return { received: read?.derived, expected: { state: 'ready' } };
    },
  ],
  [
    '#readItem derives attempts used up from the max attempts of the kind',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      const phases = new Map([[attempt.phase, 1]]);

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, slot: 1, slotGen: 1 }, state: 'failed' }),
        );
      });

      const read = await store.read((transaction) =>
        transaction.readItem(
          item.id,
          brandSchemas.instant.parse(5000),
          new Map([[item.kind, phases]]),
        ),
      );

      return {
        received: read?.derived,
        expected: { state: 'waiting', reason: 'attempts used up' },
      };
    },
  ],
  [
    '#listItems keeps the items of one state and repo, oldest first',
    async (store) => {
      const repo = brandSchemas.repoName.parse('acme/lamps');
      const older = buildMockItemRow({ repo, filedAt: brandSchemas.instant.parse(1000) });
      const newer = buildMockItemRow({ repo, filedAt: brandSchemas.instant.parse(2000) });
      const idea = buildMockItemRow({ repo, acceptance: [] });
      const elsewhere = buildMockItemRow({ repo: brandSchemas.repoName.parse('acme/fans') });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(newer));
        await transaction.applyChange(buildMockFileItemChange(older));
        await transaction.applyChange(buildMockFileItemChange(idea));
        await transaction.applyChange(buildMockFileItemChange(elsewhere));
      });

      const listed = await store.read((transaction) =>
        transaction.listItems(
          { state: 'ready', repo },
          brandSchemas.instant.parse(5000),
          new Map(),
        ),
      );

      return { received: listed.map((item) => item.id), expected: [older.id, newer.id] };
    },
  ],
  [
    '#listOpenIssues returns the open core.issue items of one repo',
    async (store) => {
      const repo = brandSchemas.repoName.parse('acme/lamps');
      const open = buildMockItemRow({ repo });
      const closed = buildMockItemRow({ repo, closedAt: brandSchemas.instant.parse(1500) });
      const elsewhere = buildMockItemRow({ repo: brandSchemas.repoName.parse('acme/fans') });
      const task = buildMockItemRow({ repo, kind: brandSchemas.itemKindName.parse('core.task') });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(open));
        await transaction.applyChange(buildMockFileItemChange(closed));
        await transaction.applyChange(buildMockFileItemChange(elsewhere));
        await transaction.applyChange(buildMockFileItemChange(task));
      });

      const listed: unknown = await store.read((transaction) =>
        transaction.listOpenIssues(repo, brandSchemas.instant.parse(5000), new Map()),
      );

      return { received: listed, expected: [{ ...open, derived: { state: 'ready' } }] };
    },
  ],
  [
    '#readItemDetail returns the item with its attempts, relations, evidence and pull requests',
    async (store) => {
      const item = buildMockItemRow();
      const blocker = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockFileItemChange(blocker));
        await transaction.applyChange(buildMockClaimChange(attempt));

        await transaction.applyChange(
          buildMockSettleChange({
            attempt: { ...attempt, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'open' }));

        await transaction.applyChange(
          buildMockRelationChange({ source: blocker.id, target: item.id }),
        );
      });

      const detail: unknown = await store.read((transaction) =>
        transaction.readItemDetail(item.id, brandSchemas.instant.parse(5000), new Map()),
      );

      return {
        received: detail,
        expected: {
          item: { ...item, derived: { state: 'waiting', reason: 'pull request open' }, levers: [] },
          attempts: [expect.objectContaining({ id: attempt.id, state: 'succeeded' })],
          relations: [expect.objectContaining({ source: blocker.id, target: item.id })],
          evidence: [expect.objectContaining({ attempt: attempt.id, kind: 'pull_request' })],
          pullRequests: [expect.objectContaining({ attempt: attempt.id, state: 'open' })],
        },
      };
    },
  ],
  [
    '#readItemDetail returns null for an unknown item',
    async (store) => {
      const detail = await store.read((transaction) =>
        transaction.readItemDetail(
          buildMockItemRow().id,
          brandSchemas.instant.parse(5000),
          new Map(),
        ),
      );

      return { received: detail, expected: null };
    },
  ],
];
