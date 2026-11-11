import { expect, test } from 'bun:test';
import { brandSchemas, liveLevers, signalKey } from '@boxxy/model';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { buildMockLeverRow } from '@boxxy/model/test-utils/build-mock-lever-row';
import { buildMockRelationRow } from '@boxxy/model/test-utils/build-mock-relation-row';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { buildFrame } from '../build-frame.ts';
import { decide } from '../decide.ts';
import { buildMockLoadedRules } from '../test-utils/build-mock-loaded-rules.ts';

test("it gives an expedited blocked item's blocker the expedite value", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const blocked = buildMockItemView({ derived: { state: 'blocked' } });
  const blocker = buildMockItemView();
  const levers = [buildMockLeverRow({ seq: 1, kind: 'plan.expedite', item: blocked.id })];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({
      items: [blocked, blocker],
      relations: [buildMockRelationRow({ source: blocker.id, target: blocked.id })],
      levers: liveLevers(levers, now),
    }),
    rules,
    now,
  });

  expect(frame.values.get(signalKey('expedite', {}))).toStrictEqual(
    new Map([
      [blocked.id, 0],
      [blocker.id, 0],
    ]),
  );
});

test("it picks an expedited blocked item's blocker before an older item", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const older = buildMockItemView({ filedAt: brandSchemas.instant.parse(1000) });
  const blocker = buildMockItemView({ filedAt: brandSchemas.instant.parse(9000) });

  const blocked = buildMockItemView({
    filedAt: brandSchemas.instant.parse(5000),
    derived: { state: 'blocked' },
  });

  const levers = [buildMockLeverRow({ seq: 1, kind: 'plan.expedite', item: blocked.id })];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({
      items: [older, blocked, blocker],
      relations: [buildMockRelationRow({ source: blocker.id, target: blocked.id })],
      levers: liveLevers(levers, now),
    }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 2 },
  });

  expect(decision).toStrictEqual({
    picks: [
      { item: blocker.id, phase: 'build', pool: 'build' },
      { item: older.id, phase: 'build', pool: 'build' },
    ],
  });
});

test('it sorts an item with two live expedites by its oldest one', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const twice = buildMockItemView({ filedAt: brandSchemas.instant.parse(9000) });
  const once = buildMockItemView({ filedAt: brandSchemas.instant.parse(1000) });

  const levers = [
    buildMockLeverRow({ seq: 5, kind: 'plan.expedite', item: once.id }),
    buildMockLeverRow({ seq: 9, kind: 'plan.expedite', item: twice.id }),
    buildMockLeverRow({ seq: 2, kind: 'plan.expedite', item: twice.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [once, twice], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 2 },
  });

  expect(decision).toStrictEqual({
    picks: [
      { item: twice.id, phase: 'build', pool: 'build' },
      { item: once.id, phase: 'build', pool: 'build' },
    ],
  });
});

test('it drops an expedite that a later plan.unexpedite undoes', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const older = buildMockItemView({ filedAt: brandSchemas.instant.parse(1000) });
  const newer = buildMockItemView({ filedAt: brandSchemas.instant.parse(9000) });

  const levers = [
    buildMockLeverRow({ seq: 1, kind: 'plan.expedite', item: newer.id }),
    buildMockLeverRow({ seq: 2, kind: 'plan.unexpedite', item: newer.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [newer, older], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('build')]: 1 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: older.id, phase: 'build', pool: 'build' }],
  });
});
