import { expect, test } from 'bun:test';
import type { Position } from '../pipeline/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockLeaseRow } from '../test-utils/build-mock-lease-row.ts';
import { buildMockRelationRow } from '../test-utils/build-mock-relation-row.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { buildMockV1ItemView } from '../test-utils/build-mock-v1-item-view.ts';
import { buildMockV1PullRequestRow } from '../test-utils/build-mock-v1-pull-request-row.ts';
import { deriveItemState } from './derive-item-state.ts';

function setupTest() {
  const phases = new Map([
    [brandSchemas.phaseName.parse('design'), { needsAcceptance: false }],
    [brandSchemas.phaseName.parse('build'), { needsAcceptance: true }],
  ]);

  const buildPosition: Position = {
    kind: 'phase',
    phase: brandSchemas.phaseName.parse('build'),
    round: 1,
  };

  return {
    buildPosition,
    endPosition: { kind: 'end', reason: 'reviewed' } satisfies Position,
    base: {
      liveLease: null,
      phases,
      attempts: [],
      pullRequests: [],
      relations: [],
      blockerStates: new Map(),
    },
  };
}

test('it derives archived for a closed item, ahead of a live lease', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView({ closedAt: brandSchemas.instant.parse(9000) });

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.buildPosition,
    liveLease: buildMockLeaseRow({ item: item.id }),
  });

  expect(state).toStrictEqual({ state: 'archived' });
});

test('it derives running for an item with a live lease, ahead of a hold', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: {
      kind: 'hold',
      reason: 'attempts used up',
      // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
      then: brandSchemas.phaseName.parse('build'),
      round: 1,
    },
    liveLease: buildMockLeaseRow({ item: item.id }),
  });

  expect(state).toStrictEqual({ state: 'running' });
});

test.each(['attempts used up', 'rounds used up', 'outcome not in rules'] as const)(
  'it derives waiting with the engine hold %s',
  (reason) => {
    const ctx = setupTest();

    const state = deriveItemState({
      ...ctx.base,
      item: buildMockV1ItemView(),
      // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
      position: { kind: 'hold', reason, then: brandSchemas.phaseName.parse('build'), round: 1 },
    });

    expect(state).toStrictEqual({ state: 'waiting', reason });
  },
);

test('it derives waiting with the reason of a hold edge', () => {
  const ctx = setupTest();
  const reason = brandSchemas.rulesHoldReason.parse('declined');

  const state = deriveItemState({
    ...ctx.base,
    item: buildMockV1ItemView(),
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    position: { kind: 'hold', reason, then: brandSchemas.phaseName.parse('triage'), round: 1 },
  });

  expect(state).toStrictEqual({ state: 'waiting', reason });
});

test('it derives done at an end when a pull request of a succeeded build attempt merged', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();
  const attempt = buildMockV1AttemptRow({ item: item.id, state: 'succeeded' });

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.endPosition,
    attempts: [attempt],
    pullRequests: [
      buildMockV1PullRequestRow({ attempt: attempt.id, state: 'closed' }),
      buildMockV1PullRequestRow({ attempt: attempt.id, state: 'merged' }),
    ],
  });

  expect(state).toStrictEqual({ state: 'done' });
});

test('it derives waiting on pull request open at an end with an open pull request', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();
  const attempt = buildMockV1AttemptRow({ item: item.id, state: 'succeeded' });

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.endPosition,
    attempts: [attempt],
    pullRequests: [buildMockV1PullRequestRow({ attempt: attempt.id, state: 'open' })],
  });

  expect(state).toStrictEqual({ state: 'waiting', reason: 'pull request open' });
});

test('it derives waiting on pull request closed unmerged when every linked pull request closed unmerged', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();
  const attempt = buildMockV1AttemptRow({ item: item.id, state: 'succeeded' });

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.endPosition,
    attempts: [attempt],
    pullRequests: [buildMockV1PullRequestRow({ attempt: attempt.id, state: 'closed' })],
  });

  expect(state).toStrictEqual({ state: 'waiting', reason: 'pull request closed unmerged' });
});

test('it derives waiting on no pull request linked at an end with none', () => {
  const ctx = setupTest();

  const state = deriveItemState({
    ...ctx.base,
    item: buildMockV1ItemView(),
    position: ctx.endPosition,
  });

  expect(state).toStrictEqual({ state: 'waiting', reason: 'no pull request linked' });
});

test('it ignores a merged pull request of a failed build attempt', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();
  const attempt = buildMockV1AttemptRow({ item: item.id, state: 'failed' });

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.endPosition,
    attempts: [attempt],
    pullRequests: [buildMockV1PullRequestRow({ attempt: attempt.id, state: 'merged' })],
  });

  expect(state).toStrictEqual({ state: 'waiting', reason: 'no pull request linked' });
});

test('it ignores a merged pull request of a succeeded attempt of another phase', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();

  const attempt = buildMockV1AttemptRow({
    item: item.id,
    state: 'succeeded',
    phase: brandSchemas.phaseName.parse('design'),
  });

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.endPosition,
    attempts: [attempt],
    pullRequests: [buildMockV1PullRequestRow({ attempt: attempt.id, state: 'merged' })],
  });

  expect(state).toStrictEqual({ state: 'waiting', reason: 'no pull request linked' });
});

test('it derives idea at a phase that needs acceptance when the acceptance list is empty', () => {
  const ctx = setupTest();

  const state = deriveItemState({
    ...ctx.base,
    item: buildMockV1ItemView({ acceptance: [] }),
    position: ctx.buildPosition,
  });

  expect(state).toStrictEqual({ state: 'idea' });
});

test('it derives ready at a phase that needs no acceptance when the acceptance list is empty', () => {
  const ctx = setupTest();

  const state = deriveItemState({
    ...ctx.base,
    item: buildMockV1ItemView({ acceptance: [] }),
    position: { kind: 'phase', phase: brandSchemas.phaseName.parse('design'), round: 1 },
  });

  expect(state).toStrictEqual({ state: 'ready' });
});

test('it derives blocked for the target of a blocks relation whose source is not done', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();
  const blocker = buildMockV1ItemView();

  const state = deriveItemState({
    ...ctx.base,
    item,
    position: ctx.buildPosition,
    relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
    blockerStates: new Map([[blocker.id, 'running']]),
  });

  expect(state).toStrictEqual({ state: 'blocked' });
});

test.each(['done', 'archived'] as const)(
  'it derives ready for the target of a blocks relation whose source is %s',
  (blockerState) => {
    const ctx = setupTest();
    const item = buildMockV1ItemView();
    const blocker = buildMockV1ItemView();

    const state = deriveItemState({
      ...ctx.base,
      item,
      position: ctx.buildPosition,
      relations: [buildMockRelationRow({ source: blocker.id, target: item.id })],
      blockerStates: new Map([[blocker.id, blockerState]]),
    });

    expect(state).toStrictEqual({ state: 'ready' });
  },
);

test('it derives ready for an item that no other row matches', () => {
  const ctx = setupTest();

  const state = deriveItemState({
    ...ctx.base,
    item: buildMockV1ItemView(),
    position: ctx.buildPosition,
  });

  expect(state).toStrictEqual({ state: 'ready' });
});
