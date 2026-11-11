import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockAttemptRow } from '../test-utils/build-mock-attempt-row.ts';
import { buildMockItemRow } from '../test-utils/build-mock-item-row.ts';
import { buildMockItemRows } from '../test-utils/build-mock-item-rows.ts';
import { buildMockLeaseRow } from '../test-utils/build-mock-lease-row.ts';
import { buildMockLeverRow } from '../test-utils/build-mock-lever-row.ts';
import { buildMockPullRequestRow } from '../test-utils/build-mock-pull-request-row.ts';
import { buildMockRelationRow } from '../test-utils/build-mock-relation-row.ts';
import { deriveItemState } from './derive-item-state.ts';

test('it derives archived for a closed item, ahead of every later row', () => {
  const item = buildMockItemRow({ closedAt: brandSchemas.instant.parse(9000), acceptance: [] });
  const succeeded = buildMockAttemptRow({ item: item.id, state: 'succeeded' });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [succeeded],
    pullRequests: [buildMockPullRequestRow({ attempt: succeeded.id, state: 'merged' })],
    liveLease: buildMockLeaseRow({ item: item.id }),
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'archived' });
});

test('it derives done when a pull request of a succeeded attempt merged, ahead of every later row', () => {
  const item = buildMockItemRow({ acceptance: [] });
  const merged = buildMockAttemptRow({ item: item.id, state: 'succeeded' });
  const open = buildMockAttemptRow({ item: item.id, state: 'succeeded' });
  const unlinked = buildMockAttemptRow({ item: item.id, state: 'succeeded' });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      merged,
      open,
      unlinked,
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
    ],
    pullRequests: [
      buildMockPullRequestRow({ attempt: merged.id, state: 'merged' }),
      buildMockPullRequestRow({ attempt: open.id, state: 'open' }),
    ],
    liveLease: buildMockLeaseRow({ item: item.id }),
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'done' });
});

test('it derives running for an item with a live lease, ahead of every later row', () => {
  const item = buildMockItemRow({ acceptance: [] });
  const open = buildMockAttemptRow({ item: item.id, state: 'succeeded' });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      open,
      buildMockAttemptRow({ item: item.id, state: 'succeeded' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
    ],
    pullRequests: [buildMockPullRequestRow({ attempt: open.id, state: 'open' })],
    liveLease: buildMockLeaseRow({ item: item.id }),
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'running' });
});

test('it derives waiting on pull request open when a succeeded attempt has an open pull request, ahead of every later row', () => {
  const item = buildMockItemRow({ acceptance: [] });
  const open = buildMockAttemptRow({ item: item.id, state: 'succeeded' });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      open,
      buildMockAttemptRow({ item: item.id, state: 'succeeded' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
    ],
    pullRequests: [buildMockPullRequestRow({ attempt: open.id, state: 'open' })],
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({
    state: 'waiting',
    reason: 'pull request open',
  });
});

test('it derives waiting on no pull request linked for a succeeded attempt with no pull request, ahead of every later row', () => {
  const item = buildMockItemRow({ acceptance: [] });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      buildMockAttemptRow({ item: item.id, state: 'succeeded' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
    ],
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({
    state: 'waiting',
    reason: 'no pull request linked',
  });
});

test('it derives waiting on attempts used up when the failed attempts reach maxAttempts, ahead of every later row', () => {
  const item = buildMockItemRow({ acceptance: [] });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
      buildMockAttemptRow({ item: item.id, state: 'failed' }),
    ],
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({
    state: 'waiting',
    reason: 'attempts used up',
  });
});

test('it derives idea for an item with an empty acceptance list, ahead of blocked', () => {
  const item = buildMockItemRow({ acceptance: [] });
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'ready']]),
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'idea' });
});

test('it derives blocked for the target of a blocks relation whose source is not done', () => {
  const item = buildMockItemRow();
  const blocker = buildMockItemRow();

  const rows = buildMockItemRows({
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'running']]),
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'blocked' });
});

test('it derives ready for an item that no other row matches', () => {
  const item = buildMockItemRow();

  expect(deriveItemState(item, buildMockItemRows())).toStrictEqual({ state: 'ready' });
});

test('it derives ready for a waiting item after an item.retry lever', () => {
  const item = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      buildMockAttemptRow({
        item: item.id,
        state: 'failed',
        endedAt: brandSchemas.instant.parse(1000),
      }),
      buildMockAttemptRow({
        item: item.id,
        state: 'failed',
        endedAt: brandSchemas.instant.parse(2000),
      }),
    ],
    levers: [
      buildMockLeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(3000),
      }),
    ],
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
});

test('it derives ready after an item.retry lever for a succeeded attempt with an open pull request', () => {
  const item = buildMockItemRow();

  const succeeded = buildMockAttemptRow({
    item: item.id,
    state: 'succeeded',
    endedAt: brandSchemas.instant.parse(1000),
  });

  const rows = buildMockItemRows({
    attempts: [succeeded],
    pullRequests: [buildMockPullRequestRow({ attempt: succeeded.id, state: 'open' })],
    levers: [
      buildMockLeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(3000),
      }),
    ],
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
});

test('it derives ready after an item.retry lever for a succeeded attempt with no pull request', () => {
  const item = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      buildMockAttemptRow({
        item: item.id,
        state: 'succeeded',
        endedAt: brandSchemas.instant.parse(1000),
      }),
    ],
    levers: [
      buildMockLeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(3000),
      }),
    ],
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
});

test('it counts only the attempts that ended after the latest of two item.retry levers', () => {
  const item = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      buildMockAttemptRow({
        item: item.id,
        state: 'failed',
        endedAt: brandSchemas.instant.parse(2000),
      }),
    ],
    levers: [
      buildMockLeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(1000),
      }),
      buildMockLeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(3000),
      }),
    ],
    maxAttempts: 1,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
});

test('it counts a failed attempt that ended after the latest item.retry lever', () => {
  const item = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [
      buildMockAttemptRow({
        item: item.id,
        state: 'failed',
        endedAt: brandSchemas.instant.parse(1000),
      }),
      buildMockAttemptRow({
        item: item.id,
        state: 'failed',
        endedAt: brandSchemas.instant.parse(4000),
      }),
    ],
    levers: [
      buildMockLeverRow({
        item: item.id,
        kind: 'item.retry',
        at: brandSchemas.instant.parse(3000),
      }),
    ],
    maxAttempts: 1,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({
    state: 'waiting',
    reason: 'attempts used up',
  });
});

test('it derives ready when the only succeeded attempt has a pull request that closed unmerged', () => {
  const item = buildMockItemRow();
  const succeeded = buildMockAttemptRow({ item: item.id, state: 'succeeded' });

  const rows = buildMockItemRows({
    attempts: [succeeded],
    pullRequests: [buildMockPullRequestRow({ attempt: succeeded.id, state: 'closed' })],
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
});

test('it derives ready while the failed attempts stay below maxAttempts', () => {
  const item = buildMockItemRow();

  const rows = buildMockItemRows({
    attempts: [buildMockAttemptRow({ item: item.id, state: 'failed' })],
    maxAttempts: 2,
  });

  expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
});

test.each(['done', 'archived'] as const)(
  'it derives ready for the target of a blocks relation whose source is %s',
  (blockerState) => {
    const item = buildMockItemRow();
    const blocker = buildMockItemRow();

    const rows = buildMockItemRows({
      relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
      blockerStates: new Map([[blocker.id, blockerState]]),
    });

    expect(deriveItemState(item, rows)).toStrictEqual({ state: 'ready' });
  },
);
