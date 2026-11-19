import { expect, test } from 'bun:test';
import type { ItemWithLevers, WaitNoticeMark } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockItemRules } from '@boxxy/model/test-utils/build-mock-item-rules';
import { buildMockPipeline } from '@boxxy/model/test-utils/build-mock-pipeline';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { collectWaitNotices } from './collect-wait-notices.ts';

function setupTest() {
  const item: ItemWithLevers = {
    ...buildMockV1ItemView({
      derived: { state: 'waiting', reason: 'wait:shipped' },
      position: { kind: 'phase', phase: brandSchemas.phaseName.parse('build'), round: 1 },
    }),
    levers: [],
    positionSince: brandSchemas.instant.parse(1000),
  };

  return {
    item,
    buildRules: (step: { waitNoticeHours?: number } = {}) =>
      buildMockItemRules({
        kinds: new Map([
          [
            item.kind,
            {
              pipeline: buildMockPipeline({
                phases: ['build'],
                steps: { build: { waits: ['shipped'], ...step } },
              }),
            },
          ],
        ]),
      }),
    buildMark: (since: number): WaitNoticeMark => ({
      itemId: item.id,
      since: brandSchemas.instant.parse(since),
      noticedAt: brandSchemas.instant.parse(since + 1),
    }),
  };
}

test.each([
  { title: 'under the default time', since: 1000, now: 21_601_000, expected: 0 },
  { title: 'over the default time', since: 1000, now: 21_601_001, expected: 1 },
  { title: 'an unknown arrival time', since: null, now: 360_000_000, expected: 0 },
])('it picks $expected notices for $title', (row) => {
  const ctx = setupTest();

  const item: ItemWithLevers = {
    ...ctx.item,
    positionSince: row.since === null ? null : brandSchemas.instant.parse(row.since),
  };

  const drafts = collectWaitNotices(
    [item],
    ctx.buildRules(),
    [],
    brandSchemas.instant.parse(row.now),
  );

  expect(drafts).toHaveLength(row.expected);
});

test.each([
  { title: 'a step time under the default', hours: 2, now: 7_201_001, expected: 1 },
  { title: 'a step time over the default', hours: 12, now: 25_201_000, expected: 0 },
])('it picks $expected notices for $title', (row) => {
  const ctx = setupTest();

  const drafts = collectWaitNotices(
    [ctx.item],
    ctx.buildRules({ waitNoticeHours: row.hours }),
    [],
    brandSchemas.instant.parse(row.now),
  );

  expect(drafts).toHaveLength(row.expected);
});

test('it picks no notice for a stay that already has its notice', () => {
  const ctx = setupTest();

  const drafts = collectWaitNotices(
    [ctx.item],
    ctx.buildRules(),
    [ctx.buildMark(1000)],
    brandSchemas.instant.parse(25_201_000),
  );

  expect(drafts).toStrictEqual([]);
});

test('it picks a new notice for a return to the step after a notice for an earlier stay', () => {
  const ctx = setupTest();

  const returned: ItemWithLevers = {
    ...ctx.item,
    positionSince: brandSchemas.instant.parse(50_000_000),
  };

  const drafts = collectWaitNotices(
    [returned],
    ctx.buildRules(),
    [ctx.buildMark(1000)],
    brandSchemas.instant.parse(75_200_000),
  );

  expect(drafts).toStrictEqual([
    {
      item: ctx.item.id,
      phase: brandSchemas.phaseName.parse('build'),
      since: brandSchemas.instant.parse(50_000_000),
      reason: 'wait-overdue:shipped:6',
    },
  ]);
});

test('it picks no notice for an item that is not waiting on a wait kind', () => {
  const ctx = setupTest();
  const ready: ItemWithLevers = { ...ctx.item, derived: { state: 'ready' } };

  const drafts = collectWaitNotices(
    [ready],
    ctx.buildRules(),
    [],
    brandSchemas.instant.parse(360_000_000),
  );

  expect(drafts).toStrictEqual([]);
});
