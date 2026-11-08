import { expect, test } from 'bun:test';
import { brandSchemas, liveLevers } from '@boxxy/model';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { buildMockLeverRow } from '@boxxy/model/test-utils/build-mock-lever-row';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { buildFrame } from '../build-frame.ts';
import { decide } from '../decide.ts';
import { buildMockLoadedRules } from '../test-utils/build-mock-loaded-rules.ts';

test("it holds a deferred item with its lever's reason", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.defer', item: item.id, reason: 'waits on a design' }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  expect(frame.holds).toStrictEqual(
    new Map([[item.id, [{ gate: 'defer', reason: 'waits on a design' }]]]),
  );
});

test('it picks an expedited deferred item', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.defer', item: item.id }),
    buildMockLeverRow({ seq: 2, kind: 'plan.expedite', item: item.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 1 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: item.id, phase: 'build', pool: 'build' }],
  });
});

test('it picks an expedited deferred item when no propagation line carries expedite', () => {
  const rules = buildMockLoadedRules({ propagation: [] });
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.defer', item: item.id }),
    buildMockLeverRow({ seq: 2, kind: 'plan.expedite', item: item.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 1 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: item.id, phase: 'build', pool: 'build' }],
  });
});

test("it records the waiver that lifts an expedited item's defer hold", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.defer', item: item.id }),
    buildMockLeverRow({ seq: 2, kind: 'plan.expedite', item: item.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  expect({ holds: frame.holds, lifted: frame.lifted }).toStrictEqual({
    holds: new Map(),
    lifted: new Map([
      [item.id, [{ waiver: 'expedite-lifts-defer', gate: 'defer', reason: 'expedited' }]],
    ]),
  });
});

test('it holds a deferred item until its until, with the until on the hold', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const until = brandSchemas.instant.parse(60_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.defer', item: item.id, until, reason: 'after lunch' }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  expect(frame.holds).toStrictEqual(
    new Map([[item.id, [{ gate: 'defer', reason: 'after lunch', until }]]]),
  );
});

test('it picks a deferred item once its until has passed', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(60_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({
      seq: 1,
      kind: 'plan.defer',
      item: item.id,
      until: brandSchemas.instant.parse(60_000),
    }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 1 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: item.id, phase: 'build', pool: 'build' }],
  });
});

test('it picks a deferred item after a later plan.undefer', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.defer', item: item.id }),
    buildMockLeverRow({ seq: 2, kind: 'plan.undefer', item: item.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 1 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: item.id, phase: 'build', pool: 'build' }],
  });
});

test('it holds by the latest live defer when an item has two', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();

  const levers = [
    buildMockLeverRow({
      seq: 4,
      kind: 'plan.defer',
      item: item.id,
      until: brandSchemas.instant.parse(90_000),
      reason: 'until the release',
    }),
    buildMockLeverRow({
      seq: 2,
      kind: 'plan.defer',
      item: item.id,
      until: null,
      reason: 'no date yet',
    }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [item], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  expect(frame.holds).toStrictEqual(
    new Map([
      [
        item.id,
        [{ gate: 'defer', reason: 'until the release', until: brandSchemas.instant.parse(90_000) }],
      ],
    ]),
  );
});
