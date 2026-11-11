import { expect } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMockV1LeverRow } from '@boxxy/model/test-utils/build-mock-v1-lever-row';
import { buildMockClaimChange } from './build-mock-claim-change.ts';
import { buildMockFileItemChange } from './build-mock-file-item-change.ts';
import { buildMockLeverChange } from './build-mock-lever-change.ts';
import { buildMockNoteChange } from './build-mock-note-change.ts';
import { buildMockPullRequestChange } from './build-mock-pull-request-change.ts';
import { buildMockRelationChange } from './build-mock-relation-change.ts';
import { buildMockSettleChange } from './build-mock-settle-change.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreItemReaderCases: readonly ClaimStoreCase[] = [
  [
    '#readSnapshot holds the open items, the store version and the limits',
    async (store) => {
      const open = buildMockV1ItemRow();
      const archived = buildMockV1ItemRow({ closedAt: brandSchemas.instant.parse(1500) });

      await store.exclusive(async (transaction) => {
        await transaction.syncLimits(
          [{ name: brandSchemas.limitName.parse('workers'), max: 2, counts: {} }],
          brandSchemas.instant.parse(500),
        );

        await transaction.applyChange(buildMockFileItemChange(open));
        await transaction.applyChange(buildMockFileItemChange(archived));
      });

      const snapshot: unknown = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: snapshot,
        expected: {
          storeVersion: 2,
          items: [
            {
              ...open,
              derived: { state: 'ready' },
              position: { kind: 'phase', phase: 'build', round: 1 },
            },
          ],
          relations: [],
          levers: [],
          limits: [{ name: 'workers', max: 2, counts: {}, held: 0 }],
          wakes: [],
        },
      };
    },
  ],
  [
    '#readSnapshot lists the sleeping attempts asked to wake, oldest request first',
    async (store) => {
      const later = buildMockV1AttemptRow({
        state: 'sleeping',
        wakeRequestedAt: brandSchemas.instant.parse(4000),
        fields: { designMode: ['attended'] },
      });

      const earlier = buildMockV1AttemptRow({
        state: 'sleeping',
        wakeRequestedAt: brandSchemas.instant.parse(3000),
      });

      const unasked = buildMockV1AttemptRow({ state: 'sleeping' });

      await store.exclusive(async (transaction) => {
        for (const attempt of [later, earlier, unasked]) {
          await transaction.applyChange(
            buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
          );

          await transaction.applyChange(buildMockClaimChange(attempt));
        }
      });

      const snapshot = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: snapshot.wakes,
        expected: [
          {
            attempt: earlier.id,
            item: earlier.item,
            phase: 'build',
            pool: 'main',
            fields: {},
            requestedAt: 3000,
          },
          {
            attempt: later.id,
            item: later.item,
            phase: 'build',
            pool: 'main',
            fields: { designMode: ['attended'] },
            requestedAt: 4000,
          },
        ],
      };
    },
  ],
  [
    '#readSnapshot drops a done item',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockSettleChange({ attempt, state: 'succeeded' }));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'merged' }));
      });

      const snapshot = await store.read((transaction) =>
        transaction.readSnapshot(brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return { received: snapshot.items, expected: [] };
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
  [
    '#readItem derives blocked for the target of a live relation from a ready item',
    async (store) => {
      const source = buildMockV1ItemRow();
      const target = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(source));
        await transaction.applyChange(buildMockFileItemChange(target));

        await transaction.applyChange(
          buildMockRelationChange({ source: source.id, target: target.id }),
        );
      });

      const read = await store.read((transaction) =>
        transaction.readItem(target.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return { received: read?.derived, expected: { state: 'blocked' } };
    },
  ],
  [
    '#readItem derives ready for the target of a relation from an archived item',
    async (store) => {
      const source = buildMockV1ItemRow({ closedAt: brandSchemas.instant.parse(1500) });
      const target = buildMockV1ItemRow();

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(source));
        await transaction.applyChange(buildMockFileItemChange(target));

        await transaction.applyChange(
          buildMockRelationChange({ source: source.id, target: target.id }),
        );
      });

      const read = await store.read((transaction) =>
        transaction.readItem(target.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return { received: read?.derived, expected: { state: 'ready' } };
    },
  ],
  [
    '#readItem holds an item whose phase lost its attempts in a row',
    async (store) => {
      const item = buildMockV1ItemRow();
      const first = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      const second = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        for (const attempt of [first, second]) {
          await transaction.applyChange(buildMockClaimChange(attempt));
          await transaction.applyChange(buildMockSettleChange({ attempt, state: 'failed' }));
        }
      });

      const read = await store.read((transaction) =>
        transaction.readItem(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: { derived: read?.derived, position: read?.position.kind },
        expected: { derived: { state: 'waiting', reason: 'attempts used up' }, position: 'hold' },
      };
    },
  ],
  [
    '#readItem returns a held item to its phase after a retry lever',
    async (store) => {
      const item = buildMockV1ItemRow();
      const first = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      const second = buildMockV1AttemptRow({
        item: item.id,
        state: 'starting',
        number: 2,
        leaseGen: 2,
      });

      const retry = buildMockV1LeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(4000),
      });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));

        for (const attempt of [first, second]) {
          await transaction.applyChange(buildMockClaimChange(attempt));
          await transaction.applyChange(buildMockSettleChange({ attempt, state: 'failed' }));
        }

        await transaction.applyChange(buildMockLeverChange(retry));
      });

      const read = await store.read((transaction) =>
        transaction.readItem(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: { derived: read?.derived, position: read?.position },
        expected: {
          derived: { state: 'ready' },
          position: { kind: 'phase', phase: 'build', round: 1 },
        },
      };
    },
  ],
  [
    '#readItem ends an item whose last phase of the pipeline succeeded',
    async (store) => {
      const item = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockSettleChange({ attempt, state: 'succeeded' }));
      });

      const read = await store.read((transaction) =>
        transaction.readItem(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: { derived: read?.derived, position: read?.position },
        expected: {
          derived: { state: 'waiting', reason: 'no pull request linked' },
          position: { kind: 'end', reason: 'pipeline-done' },
        },
      };
    },
  ],
  [
    '#listItems keeps the items of one state and repo, oldest first',
    async (store) => {
      const repo = brandSchemas.repoName.parse('acme/lamps');
      const older = buildMockV1ItemRow({ repo, filedAt: brandSchemas.instant.parse(1000) });
      const newer = buildMockV1ItemRow({ repo, filedAt: brandSchemas.instant.parse(2000) });
      const idea = buildMockV1ItemRow({ repo, acceptance: [] });
      const elsewhere = buildMockV1ItemRow({ repo: brandSchemas.repoName.parse('acme/fans') });
      const build = brandSchemas.phaseName.parse('build');

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
          buildMockItemRules({ phases: new Map([[build, { needsAcceptance: true }]]) }),
        ),
      );

      return { received: listed.map((item) => item.id), expected: [older.id, newer.id] };
    },
  ],
  [
    '#listOpenIssues returns the open core.issue items of one repo',
    async (store) => {
      const repo = brandSchemas.repoName.parse('acme/lamps');
      const open = buildMockV1ItemRow({ repo });
      const closed = buildMockV1ItemRow({ repo, closedAt: brandSchemas.instant.parse(1500) });
      const elsewhere = buildMockV1ItemRow({ repo: brandSchemas.repoName.parse('acme/fans') });
      const task = buildMockV1ItemRow({ repo, kind: brandSchemas.itemKindName.parse('core.task') });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(open));
        await transaction.applyChange(buildMockFileItemChange(closed));
        await transaction.applyChange(buildMockFileItemChange(elsewhere));
        await transaction.applyChange(buildMockFileItemChange(task));
      });

      const listed: unknown = await store.read((transaction) =>
        transaction.listOpenIssues(repo, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: listed,
        expected: [
          {
            ...open,
            derived: { state: 'ready' },
            position: { kind: 'phase', phase: 'build', round: 1 },
          },
        ],
      };
    },
  ],
  [
    '#readItemDetail returns the item with its attempts, relations, evidence, pull requests and notes',
    async (store) => {
      const item = buildMockV1ItemRow();
      const blocker = buildMockV1ItemRow();
      const attempt = buildMockV1AttemptRow({ item: item.id, state: 'starting' });

      const note = {
        item: item.id,
        seq: 1,
        text: 'The lamp hums when dimmed.',
        by: 'boxxy:owner:local',
        at: brandSchemas.instant.parse(4500),
      } as const;

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockFileItemChange(blocker));
        await transaction.applyChange(buildMockClaimChange(attempt));
        await transaction.applyChange(buildMockSettleChange({ attempt, state: 'succeeded' }));
        await transaction.applyChange(buildMockPullRequestChange({ attempt, state: 'open' }));

        await transaction.applyChange(
          buildMockRelationChange({ source: blocker.id, target: item.id }),
        );

        await transaction.applyChange(buildMockNoteChange(note));
      });

      const detail: unknown = await store.read((transaction) =>
        transaction.readItemDetail(item.id, brandSchemas.instant.parse(5000), buildMockItemRules()),
      );

      return {
        received: detail,
        expected: {
          item: {
            ...item,
            derived: { state: 'waiting', reason: 'pull request open' },
            position: { kind: 'end', reason: 'pipeline-done' },
            levers: [],
          },
          attempts: [expect.objectContaining({ id: attempt.id, state: 'succeeded' })],
          relations: [expect.objectContaining({ source: blocker.id, target: item.id })],
          evidence: [expect.objectContaining({ attempt: attempt.id, kind: 'pull_request' })],
          pullRequests: [expect.objectContaining({ attempt: attempt.id, state: 'open' })],
          notes: [note],
        },
      };
    },
  ],
  [
    '#readItemDetail returns null for an unknown item',
    async (store) => {
      const detail = await store.read((transaction) =>
        transaction.readItemDetail(
          buildMockV1ItemRow().id,
          brandSchemas.instant.parse(5000),
          buildMockItemRules(),
        ),
      );

      return { received: detail, expected: null };
    },
  ],
  [
    '#listItemNotes returns the notes of one item by seq',
    async (store) => {
      const item = buildMockV1ItemRow();
      const other = buildMockV1ItemRow();

      const note = (id: typeof item.id, seq: number, text: string) =>
        buildMockNoteChange({
          item: id,
          seq,
          text,
          by: 'boxxy:owner:local',
          at: brandSchemas.instant.parse(4000 + seq),
        });

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockFileItemChange(other));
        await transaction.applyChange(note(item.id, 2, 'The switch sticks.'));
        await transaction.applyChange(note(other.id, 1, 'The cord frays.'));
        await transaction.applyChange(note(item.id, 1, 'The bulb flickers.'));
      });

      const notes = await store.read((transaction) => transaction.listItemNotes(item.id));

      return {
        received: notes.map((row) => row.text),
        expected: ['The bulb flickers.', 'The switch sticks.'],
      };
    },
  ],
  [
    '#applyChange throws on a second note with the same seq on one item',
    async (store) => {
      const item = buildMockV1ItemRow();

      const note = {
        item: item.id,
        seq: 1,
        text: 'The bulb flickers.',
        by: 'boxxy:owner:local',
        at: brandSchemas.instant.parse(4500),
      } as const;

      await store.exclusive(async (transaction) => {
        await transaction.applyChange(buildMockFileItemChange(item));
        await transaction.applyChange(buildMockNoteChange(note));
      });

      const settled = await store
        .exclusive((transaction) => transaction.applyChange(buildMockNoteChange(note)))
        .then(
          () => 'applied',
          () => 'thrown',
        );

      return { received: settled, expected: 'thrown' };
    },
  ],
];
