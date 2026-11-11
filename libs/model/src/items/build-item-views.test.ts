import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockLeaseRow } from '../test-utils/build-mock-lease-row.ts';
import { buildMockPipeline } from '../test-utils/build-mock-pipeline.ts';
import { buildMockRelationRow } from '../test-utils/build-mock-relation-row.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { buildMockV1ItemRow } from '../test-utils/build-mock-v1-item-row.ts';
import { buildMockV1LeverRow } from '../test-utils/build-mock-v1-lever-row.ts';
import { buildMockV1PullRequestRow } from '../test-utils/build-mock-v1-pull-request-row.ts';
import { buildItemViews } from './build-item-views.ts';

test('it gives an item with no rows beside it the first phase of its pipeline, ready', () => {
  const item = buildMockV1ItemRow();

  const views: unknown = buildItemViews(
    { items: [item], relations: [], levers: [], attempts: [], liveLeases: [], pullRequests: [] },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[item.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views).toStrictEqual([
    {
      ...item,
      derived: { state: 'ready' },
      position: { kind: 'phase', phase: 'build', round: 1 },
      levers: [],
    },
  ]);
});

test('it ends an item whose kind has no pipeline in the rules', () => {
  const item = buildMockV1ItemRow();

  const views = buildItemViews(
    { items: [item], relations: [], levers: [], attempts: [], liveLeases: [], pullRequests: [] },
    brandSchemas.instant.parse(5000),
    { kinds: new Map(), phases: new Map() },
  );

  expect(views[0]?.position).toStrictEqual({ kind: 'end', reason: 'no-pipeline' });
});

test('it derives idea for an item with no criteria at a phase that needs them', () => {
  const item = buildMockV1ItemRow({ acceptance: [] });
  const build = brandSchemas.phaseName.parse('build');

  const views = buildItemViews(
    { items: [item], relations: [], levers: [], attempts: [], liveLeases: [], pullRequests: [] },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[item.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map([[build, { needsAcceptance: true }]]),
    },
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'idea' });
});

test('it derives running for an item with a live lease', () => {
  const item = buildMockV1ItemRow();

  const views = buildItemViews(
    {
      items: [item],
      relations: [],
      levers: [],
      attempts: [],
      liveLeases: [buildMockLeaseRow({ item: item.id })],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[item.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'running' });
});

test('it derives done at the end of the pipeline from a merged pull request of the build', () => {
  const item = buildMockV1ItemRow();

  const attempt = buildMockV1AttemptRow({
    item: item.id,
    state: 'succeeded',
    outcome: brandSchemas.outcomeName.parse('built'),
    endedAt: brandSchemas.instant.parse(3000),
  });

  const views = buildItemViews(
    {
      items: [item],
      relations: [],
      levers: [],
      attempts: [attempt],
      liveLeases: [],
      pullRequests: [buildMockV1PullRequestRow({ attempt: attempt.id, state: 'merged' })],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[item.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'done' });
});

test('it holds an item whose phase used up its attempts in a row', () => {
  const item = buildMockV1ItemRow();

  const abandoned = (endedAt: number) =>
    buildMockV1AttemptRow({
      item: item.id,
      state: 'failed',
      outcome: brandSchemas.outcomeName.parse('abandoned'),
      endedAt: brandSchemas.instant.parse(endedAt),
    });

  const views = buildItemViews(
    {
      items: [item],
      relations: [],
      levers: [],
      attempts: [abandoned(2000), abandoned(3000)],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[item.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views[0]?.derived).toStrictEqual({ state: 'waiting', reason: 'attempts used up' });
});

test('it returns a held item to its phase after a later retry lever', () => {
  const item = buildMockV1ItemRow();

  const abandoned = (endedAt: number) =>
    buildMockV1AttemptRow({
      item: item.id,
      state: 'failed',
      outcome: brandSchemas.outcomeName.parse('abandoned'),
      endedAt: brandSchemas.instant.parse(endedAt),
    });

  const retry = buildMockV1LeverRow({
    item: item.id,
    kind: 'item.retry',
    at: brandSchemas.instant.parse(4000),
  });

  const views = buildItemViews(
    {
      items: [item],
      relations: [],
      levers: [retry],
      attempts: [abandoned(2000), abandoned(3000)],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[item.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views[0]).toStrictEqual(
    expect.objectContaining({
      derived: { state: 'ready' },
      position: { kind: 'phase', phase: 'build', round: 1 },
    }),
  );
});

test('it derives blocked for the target of a live relation whose source is ready', () => {
  const source = buildMockV1ItemRow();
  const target = buildMockV1ItemRow();

  const views = buildItemViews(
    {
      items: [source, target],
      relations: [buildMockRelationRow({ source: source.id, target: target.id })],
      levers: [],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[source.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views.map((view) => view.derived)).toStrictEqual([
    { state: 'ready' },
    { state: 'blocked' },
  ]);
});

test('it derives ready for the target of a relation whose source is archived', () => {
  const source = buildMockV1ItemRow({ closedAt: brandSchemas.instant.parse(4000) });
  const target = buildMockV1ItemRow();

  const views = buildItemViews(
    {
      items: [source, target],
      relations: [buildMockRelationRow({ source: source.id, target: target.id })],
      levers: [],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[source.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views[1]?.derived).toStrictEqual({ state: 'ready' });
});

test('it derives blocked for the target of a relation whose source is blocked', () => {
  const first = buildMockV1ItemRow();
  const second = buildMockV1ItemRow();
  const third = buildMockV1ItemRow();

  const views = buildItemViews(
    {
      items: [first, second, third],
      relations: [
        buildMockRelationRow({ source: first.id, target: second.id }),
        buildMockRelationRow({ source: second.id, target: third.id }),
      ],
      levers: [],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    {
      kinds: new Map([[first.kind, { pipeline: buildMockPipeline({ phases: ['build'] }) }]]),
      phases: new Map(),
    },
  );

  expect(views[2]?.derived).toStrictEqual({ state: 'blocked' });
});

test('it keeps only the live levers of each item', () => {
  const item = buildMockV1ItemRow();
  const defer = buildMockV1LeverRow({ seq: 1, item: item.id, kind: 'plan.defer' });
  const undefer = buildMockV1LeverRow({ seq: 2, item: item.id, kind: 'plan.undefer' });
  const other = buildMockV1LeverRow({ seq: 3, kind: 'plan.defer' });

  const views = buildItemViews(
    {
      items: [item],
      relations: [],
      levers: [defer, undefer, other],
      attempts: [],
      liveLeases: [],
      pullRequests: [],
    },
    brandSchemas.instant.parse(5000),
    { kinds: new Map(), phases: new Map() },
  );

  expect(views[0]?.levers).toStrictEqual([undefer]);
});
