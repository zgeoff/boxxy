import { expect, test } from 'bun:test';
import { brandSchemas, liveLevers, signalKey } from '@boxxy/model';
import { buildMockRelationRow } from '@boxxy/model/test-utils/build-mock-relation-row';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1LeverRow } from '@boxxy/model/test-utils/build-mock-v1-lever-row';
import { buildFrame } from '../build-frame.ts';
import { decide } from '../decide.ts';
import { buildMockLoadedRules } from '../test-utils/build-mock-loaded-rules.ts';

test("it gives an expedited blocked item's blocker the expedite value", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const blocked = buildMockV1ItemView({ derived: { state: 'blocked' } });
  const blocker = buildMockV1ItemView();
  const levers = [buildMockV1LeverRow({ seq: 1, kind: 'plan.expedite', item: blocked.id })];

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
  const older = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(1000) });
  const blocker = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(9000) });

  const blocked = buildMockV1ItemView({
    filedAt: brandSchemas.instant.parse(5000),
    derived: { state: 'blocked' },
  });

  const levers = [buildMockV1LeverRow({ seq: 1, kind: 'plan.expedite', item: blocked.id })];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({
      items: [older, blocked, blocker],
      relations: [buildMockRelationRow({ source: blocker.id, target: blocked.id })],
      levers: liveLevers(levers, now),
    }),
    rules,
    now,
  });

  const decision = decide({
    frame,
    pools: rules.pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision.picks).toStrictEqual([
    expect.objectContaining({ kind: 'start', item: blocker.id }),
    expect.objectContaining({ kind: 'start', item: older.id }),
  ]);
});

test('it sorts an item with two live expedites by its oldest one', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const twice = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(9000) });
  const once = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(1000) });

  const levers = [
    buildMockV1LeverRow({ seq: 5, kind: 'plan.expedite', item: once.id }),
    buildMockV1LeverRow({ seq: 9, kind: 'plan.expedite', item: twice.id }),
    buildMockV1LeverRow({ seq: 2, kind: 'plan.expedite', item: twice.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [once, twice], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision = decide({
    frame,
    pools: rules.pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision.picks).toStrictEqual([
    expect.objectContaining({ kind: 'start', item: twice.id }),
    expect.objectContaining({ kind: 'start', item: once.id }),
  ]);
});

test('it drops an expedite that a later plan.unexpedite undoes', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const older = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(1000) });
  const newer = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(9000) });

  const levers = [
    buildMockV1LeverRow({ seq: 1, kind: 'plan.expedite', item: newer.id }),
    buildMockV1LeverRow({ seq: 2, kind: 'plan.unexpedite', item: newer.id }),
  ];

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [newer, older], levers: liveLevers(levers, now) }),
    rules,
    now,
  });

  const decision = decide({
    frame,
    pools: rules.pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision.picks).toStrictEqual([
    expect.objectContaining({ kind: 'start', item: older.id }),
    expect.objectContaining({ kind: 'start', item: newer.id }),
  ]);
});
