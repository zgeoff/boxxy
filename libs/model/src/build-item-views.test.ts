import { expect, test } from 'bun:test';
import { brandSchemas } from './brand-schemas.ts';
import { buildItemViews } from './build-item-views.ts';
import { buildMockAttemptRow } from './test-utils/build-mock-attempt-row.ts';
import { buildMockItemRow } from './test-utils/build-mock-item-row.ts';
import { buildMockLeaseRow } from './test-utils/build-mock-lease-row.ts';
import { buildMockLeverRow } from './test-utils/build-mock-lever-row.ts';
import { buildMockLinkRow } from './test-utils/build-mock-link-row.ts';
import { buildMockPullRequestRow } from './test-utils/build-mock-pull-request-row.ts';

test('it derives ready for an item with no rows beside it', () => {
  const item = buildMockItemRow();

  const views = buildItemViews(
    { items: [item], links: [], levers: [], attempts: [], liveLeases: [], pullRequests: [] },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views).toStrictEqual([{ ...item, derived: { state: 'ready' }, levers: [] }]);
});

test('it derives running for an item with a live lease', () => {
  const item = buildMockItemRow();

  const views = buildItemViews(
    {
      items: [item],
      links: [],
      levers: [],
      attempts: [],
      liveLeases: [buildMockLeaseRow({ item: item.id })],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'running' });
});

test('it derives done from a merged PR of a succeeded attempt of the item', () => {
  const item = buildMockItemRow();
  const attempt = buildMockAttemptRow({ item: item.id, state: 'succeeded' });

  const views = buildItemViews(
    {
      items: [item],
      links: [],
      levers: [],
      attempts: [attempt],
      liveLeases: [],
      pullRequests: [buildMockPullRequestRow({ attempt: attempt.id, state: 'merged' })],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'done' });
});

test('it derives blocked for the target of a live link whose source is ready', () => {
  const source = buildMockItemRow();
  const target = buildMockItemRow();

  const views = buildItemViews(
    {
      items: [source, target],
      links: [buildMockLinkRow({ source: source.id, target: target.id })],
      levers: [],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views.map((view) => view.derived)).toStrictEqual([
    { state: 'ready' },
    { state: 'blocked' },
  ]);
});

test('it derives ready for the target of a link whose source is archived', () => {
  const source = buildMockItemRow({ closedAt: brandSchemas.instant.parse(4000) });
  const target = buildMockItemRow();

  const views = buildItemViews(
    {
      items: [source, target],
      links: [buildMockLinkRow({ source: source.id, target: target.id })],
      levers: [],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views[1]?.derived).toStrictEqual({ state: 'ready' });
});

test('it derives blocked for the target of a link whose source is blocked', () => {
  const first = buildMockItemRow();
  const second = buildMockItemRow();
  const third = buildMockItemRow();

  const views = buildItemViews(
    {
      items: [first, second, third],
      links: [
        buildMockLinkRow({ source: first.id, target: second.id }),
        buildMockLinkRow({ source: second.id, target: third.id }),
      ],
      levers: [],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views[2]?.derived).toStrictEqual({ state: 'blocked' });
});

test('it derives waiting with attempts used up at the first phase of the kind', () => {
  const item = buildMockItemRow();

  const phases = new Map([[brandSchemas.phaseName.parse('build'), 2]]);

  const views = buildItemViews(
    {
      items: [item],
      links: [],
      levers: [],
      attempts: [
        buildMockAttemptRow({ item: item.id, state: 'failed' }),
        buildMockAttemptRow({ item: item.id, state: 'failed' }),
      ],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map([[brandSchemas.itemKindName.parse('core.issue'), phases]]),
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'waiting', reason: 'attempts used up' });
});

test('it never derives attempts used up for a kind the rules do not name', () => {
  const item = buildMockItemRow();

  const views = buildItemViews(
    {
      items: [item],
      links: [],
      levers: [],
      attempts: [
        buildMockAttemptRow({ item: item.id, state: 'failed' }),
        buildMockAttemptRow({ item: item.id, state: 'failed' }),
      ],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'ready' });
});

test('it keeps only the live levers of each item', () => {
  const item = buildMockItemRow();
  const defer = buildMockLeverRow({ seq: 1, item: item.id, kind: 'plan.defer' });
  const undefer = buildMockLeverRow({ seq: 2, item: item.id, kind: 'plan.undefer' });
  const other = buildMockLeverRow({ seq: 3, kind: 'plan.defer' });

  const views = buildItemViews(
    {
      items: [item],
      links: [],
      levers: [defer, undefer, other],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    new Map(),
  );

  expect(views[0]?.levers).toStrictEqual([undefer]);
});
