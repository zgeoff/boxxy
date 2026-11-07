import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockLinkChange } from './build-mock-link-change.ts';
import { buildMockPullRequestChange } from './build-mock-pull-request-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreItemReaderCases: readonly ClaimStoreCase[] = [
  [
    '#readSnapshot holds the open items, the store version and the free slots',
    async (store) => {
      const open = buildMockItemRow();
      const archived = buildMockItemRow({ closedAt: brandSchemas.instant.parse(1500) });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: brandSchemas.poolName.parse('build'), slots: 2 }]);
        await tx.applyChange(buildMockFileItemChange(open));
        await tx.applyChange(buildMockFileItemChange(archived));
      });

      const snapshot: unknown = await store.read((tx) =>
        tx.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      expect(snapshot).toStrictEqual({
        storeVersion: 2,
        items: [{ ...open, derived: { state: 'ready' } }],
        links: [],
        levers: [],
        freeSlots: { build: 2 },
      });
    },
  ],
  [
    '#readSnapshot drops a done item',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));

        await tx.applyChange(
          buildMockSettleChange({
            attempt: { ...attempt, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await tx.applyChange(buildMockPullRequestChange({ attempt, state: 'merged' }));
      });

      const snapshot = await store.read((tx) =>
        tx.readSnapshot(brandSchemas.instant.parse(5000), new Map()),
      );

      expect(snapshot.items).toStrictEqual([]);
    },
  ],
  [
    '#readItem returns null for an unknown item',
    async (store) => {
      const read = await store.read((tx) =>
        tx.readItem(buildMockItemRow().id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(read).toBeNull();
    },
  ],
  [
    '#readItem derives blocked for the target of a live link from a ready item',
    async (store) => {
      const source = buildMockItemRow();
      const target = buildMockItemRow();

      await store.exclusive(async (tx) => {
        await tx.applyChange(buildMockFileItemChange(source));
        await tx.applyChange(buildMockFileItemChange(target));
        await tx.applyChange(buildMockLinkChange({ source: source.id, target: target.id }));
      });

      const read = await store.read((tx) =>
        tx.readItem(target.id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(read?.derived).toStrictEqual({ state: 'blocked' });
    },
  ],
  [
    '#readItem derives ready for the target of a link from an archived item',
    async (store) => {
      const source = buildMockItemRow({ closedAt: brandSchemas.instant.parse(1500) });
      const target = buildMockItemRow();

      await store.exclusive(async (tx) => {
        await tx.applyChange(buildMockFileItemChange(source));
        await tx.applyChange(buildMockFileItemChange(target));
        await tx.applyChange(buildMockLinkChange({ source: source.id, target: target.id }));
      });

      const read = await store.read((tx) =>
        tx.readItem(target.id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(read?.derived).toStrictEqual({ state: 'ready' });
    },
  ],
  [
    '#readItem derives attempts used up from the max attempts of the kind',
    async (store) => {
      const item = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      const phases = new Map([[attempt.phase, 1]]);

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockClaimChange(attempt));

        await tx.applyChange(
          buildMockSettleChange({ attempt: { ...attempt, slot: 1, slotGen: 1 }, state: 'failed' }),
        );
      });

      const read = await store.read((tx) =>
        tx.readItem(item.id, brandSchemas.instant.parse(5000), new Map([[item.kind, phases]])),
      );

      expect(read?.derived).toStrictEqual({ state: 'waiting', reason: 'attempts used up' });
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

      await store.exclusive(async (tx) => {
        await tx.applyChange(buildMockFileItemChange(newer));
        await tx.applyChange(buildMockFileItemChange(older));
        await tx.applyChange(buildMockFileItemChange(idea));
        await tx.applyChange(buildMockFileItemChange(elsewhere));
      });

      const listed = await store.read((tx) =>
        tx.listItems({ state: 'ready', repo }, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(listed.map((item) => item.id)).toStrictEqual([older.id, newer.id]);
    },
  ],
  [
    '#listOpenIssues returns the open core.issue items of one repo',
    async (store) => {
      const repo = brandSchemas.repoName.parse('acme/lamps');
      const open = buildMockItemRow({ repo });
      const closed = buildMockItemRow({ repo, closedAt: brandSchemas.instant.parse(1500) });
      const elsewhere = buildMockItemRow({ repo: brandSchemas.repoName.parse('acme/fans') });

      await store.exclusive(async (tx) => {
        await tx.applyChange(buildMockFileItemChange(open));
        await tx.applyChange(buildMockFileItemChange(closed));
        await tx.applyChange(buildMockFileItemChange(elsewhere));
      });

      const listed: unknown = await store.read((tx) =>
        tx.listOpenIssues(repo, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(listed).toStrictEqual([{ ...open, derived: { state: 'ready' } }]);
    },
  ],
  [
    '#readItemDetail returns the item with its attempts, links, evidence and PRs',
    async (store) => {
      const item = buildMockItemRow();
      const blocker = buildMockItemRow();
      const attempt = buildMockAttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (tx) => {
        await tx.syncPoolSlots([{ name: attempt.pool, slots: 1 }]);
        await tx.applyChange(buildMockFileItemChange(item));
        await tx.applyChange(buildMockFileItemChange(blocker));
        await tx.applyChange(buildMockClaimChange(attempt));

        await tx.applyChange(
          buildMockSettleChange({
            attempt: { ...attempt, slot: 1, slotGen: 1 },
            state: 'succeeded',
          }),
        );

        await tx.applyChange(buildMockPullRequestChange({ attempt, state: 'open' }));
        await tx.applyChange(buildMockLinkChange({ source: blocker.id, target: item.id }));
      });

      const detail: unknown = await store.read((tx) =>
        tx.readItemDetail(item.id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(detail).toStrictEqual({
        item: { ...item, derived: { state: 'waiting', reason: 'PR open' }, levers: [] },
        attempts: [expect.objectContaining({ id: attempt.id, state: 'succeeded' })],
        links: [expect.objectContaining({ source: blocker.id, target: item.id })],
        evidence: [expect.objectContaining({ attempt: attempt.id, kind: 'pr' })],
        pullRequests: [expect.objectContaining({ attempt: attempt.id, state: 'open' })],
      });
    },
  ],
  [
    '#readItemDetail returns null for an unknown item',
    async (store) => {
      const detail = await store.read((tx) =>
        tx.readItemDetail(buildMockItemRow().id, brandSchemas.instant.parse(5000), new Map()),
      );

      expect(detail).toBeNull();
    },
  ],
];
