import { expect, test } from 'bun:test';
import type { Pool } from '@boxxy/model';
import { brandSchemas, signalKey } from '@boxxy/model';
import { buildMockFrameItem } from '@boxxy/model/test-utils/build-mock-frame-item';
import { decide } from './decide.ts';

test('it returns the same picks for the same frame across 100 runs', () => {
  const first = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const second = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const third = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000003'),
  });

  const fourth = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000004'),
  });

  const frame = {
    candidates: [fourth, second, third, first],
    fields: new Map([
      [first.id, { phase: ['build'] }],
      [second.id, { phase: ['build'] }],
      [third.id, { phase: ['build'] }],
      [fourth.id, { phase: ['build'] }],
    ]),
    values: new Map([
      [
        signalKey('oldest', {}),
        new Map([
          [second.id, 10],
          [third.id, 10],
          [fourth.id, 5],
        ]),
      ],
    ]),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      slots: 3,
      takes: { phase: ['build'] },
      order: [signalKey('oldest', {})],
    },
  ];

  const runs: unknown = Array.from({ length: 100 }, () =>
    decide({ frame, pools, freeSlots: { [brandSchemas.poolName.parse('build')]: 3 } }),
  );

  expect(runs).toStrictEqual(
    Array.from({ length: 100 }, () => ({
      picks: [
        { item: fourth.id, phase: 'build', pool: 'build' },
        { item: second.id, phase: 'build', pool: 'build' },
        { item: third.id, phase: 'build', pool: 'build' },
      ],
    })),
  );
});

test('it sorts a candidate with no value for a signal after the candidates with one', () => {
  const valued = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const unvalued = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const frame = {
    candidates: [unvalued, valued],
    fields: new Map([
      [valued.id, { phase: ['build'] }],
      [unvalued.id, { phase: ['build'] }],
    ]),
    values: new Map([[signalKey('oldest', {}), new Map([[valued.id, 99]])]]),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      slots: 2,
      takes: { phase: ['build'] },
      order: [signalKey('oldest', {})],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    freeSlots: { [brandSchemas.poolName.parse('build')]: 2 },
  });

  expect(decision).toStrictEqual({
    picks: [
      { item: valued.id, phase: 'build', pool: 'build' },
      { item: unvalued.id, phase: 'build', pool: 'build' },
    ],
  });
});

test("it sorts by the pool's later signal when the first ties", () => {
  const first = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const second = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const frame = {
    candidates: [first, second],
    fields: new Map([
      [first.id, { phase: ['build'] }],
      [second.id, { phase: ['build'] }],
    ]),
    values: new Map([
      [
        signalKey('expedite', {}),
        new Map([
          [first.id, 0],
          [second.id, 0],
        ]),
      ],
      [
        signalKey('oldest', {}),
        new Map([
          [first.id, 800],
          [second.id, 200],
        ]),
      ],
    ]),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      slots: 1,
      takes: { phase: ['build'] },
      order: [signalKey('expedite', {}), signalKey('oldest', {})],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    freeSlots: { [brandSchemas.poolName.parse('build')]: 1 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: second.id, phase: 'build', pool: 'build' }],
  });
});

test('it offers a candidate to the first pool that takes it, and never twice', () => {
  const first = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const second = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const frame = {
    candidates: [first, second],
    fields: new Map([
      [first.id, { phase: ['build'] }],
      [second.id, { phase: ['build'] }],
    ]),
    values: new Map(),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('small'),
      slots: 1,
      takes: { phase: ['build'] },
      order: [],
    },
    {
      name: brandSchemas.poolName.parse('large'),
      slots: 4,
      takes: { phase: ['build'] },
      order: [],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    freeSlots: {
      [brandSchemas.poolName.parse('small')]: 1,
      [brandSchemas.poolName.parse('large')]: 4,
    },
  });

  expect(decision).toStrictEqual({
    picks: [
      { item: first.id, phase: 'build', pool: 'small' },
      { item: second.id, phase: 'build', pool: 'large' },
    ],
  });
});

test('it picks no held candidate', () => {
  const held = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const free = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const frame = {
    candidates: [held, free],
    fields: new Map([
      [held.id, { phase: ['build'] }],
      [free.id, { phase: ['build'] }],
    ]),
    values: new Map(),
    holds: new Map([[held.id, [{ gate: 'defer', reason: 'waits on a design' }]]]),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      slots: 2,
      takes: { phase: ['build'] },
      order: [],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    freeSlots: { [brandSchemas.poolName.parse('build')]: 2 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: free.id, phase: 'build', pool: 'build' }],
  });
});

test("it never matches a pool's filter field that a candidate has no value for", () => {
  const item = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const frame = {
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
    values: new Map(),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      slots: 2,
      takes: { phase: ['build'], area: ['maintenance'] },
      order: [],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    freeSlots: { [brandSchemas.poolName.parse('build')]: 2 },
  });

  expect(decision).toStrictEqual({ picks: [] });
});

test('it picks one candidate per free slot, and none for a pool with no free slot', () => {
  const first = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const second = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const third = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000003'),
  });

  const frame = {
    candidates: [first, second, third],
    fields: new Map([
      [first.id, { phase: ['build'] }],
      [second.id, { phase: ['build'] }],
      [third.id, { phase: ['build'] }],
    ]),
    values: new Map(),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  };

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('full'), slots: 2, takes: { phase: ['build'] }, order: [] },
    {
      name: brandSchemas.poolName.parse('build'),
      slots: 4,
      takes: { phase: ['build'] },
      order: [],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    freeSlots: {
      [brandSchemas.poolName.parse('full')]: 0,
      [brandSchemas.poolName.parse('build')]: 2,
    },
  });

  expect(decision).toStrictEqual({
    picks: [
      { item: first.id, phase: 'build', pool: 'build' },
      { item: second.id, phase: 'build', pool: 'build' },
    ],
  });
});
