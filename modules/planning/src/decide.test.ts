import { expect, test } from 'bun:test';
import type { Pool } from '@boxxy/model';
import { brandSchemas, signalKey } from '@boxxy/model';
import { buildMockFrame } from '@boxxy/model/test-utils/build-mock-frame';
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

  const frame = buildMockFrame({
    candidates: [third, second, first],
    fields: new Map([
      [first.id, { phase: ['build'] }],
      [second.id, { phase: ['build'] }],
      [third.id, { phase: ['build'] }],
    ]),
    values: new Map([
      [
        signalKey('oldest', {}),
        new Map([
          [second.id, 10],
          [third.id, 5],
        ]),
      ],
    ]),
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      takes: { phase: ['build'] },
      order: [signalKey('oldest', {})],
    },
  ];

  const runs: unknown = Array.from({ length: 100 }, () =>
    decide({
      frame,
      pools,
      snapshot: {
        limits: [{ name: brandSchemas.limitName.parse('workers'), max: 2, counts: {}, held: 0 }],
        wakes: [],
      },
      backoff: [],
    }),
  );

  const decision = {
    picks: [
      {
        kind: 'start',
        item: third.id,
        phase: 'build',
        round: 1,
        pool: 'build',
        fields: { phase: ['build'] },
        limits: ['workers'],
      },
      {
        kind: 'start',
        item: second.id,
        phase: 'build',
        round: 1,
        pool: 'build',
        fields: { phase: ['build'] },
        limits: ['workers'],
      },
    ],
    waits: [
      {
        subject: { kind: 'item', item: first.id },
        reason: { kind: 'limit-full', limit: 'workers' },
      },
    ],
  };

  expect(runs).toStrictEqual(Array.from({ length: 100 }, () => decision));
});

test('it breaks a tie on every signal by item id, whatever the candidate order', () => {
  const lower = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const higher = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const frame = buildMockFrame({
    candidates: [higher, lower],
    fields: new Map([
      [higher.id, { phase: ['build'] }],
      [lower.id, { phase: ['build'] }],
    ]),
    values: new Map([
      [
        signalKey('oldest', {}),
        new Map([
          [higher.id, 10],
          [lower.id, 10],
        ]),
      ],
    ]),
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      takes: { phase: ['build'] },
      order: [signalKey('oldest', {})],
    },
  ];

  const decision = decide({ frame, pools, snapshot: { limits: [], wakes: [] }, backoff: [] });

  expect(decision.picks).toStrictEqual([
    expect.objectContaining({ item: lower.id }),
    expect.objectContaining({ item: higher.id }),
  ]);
});

test('it sorts a candidate with no value for a signal after the candidates with one', () => {
  const valued = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const unvalued = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const frame = buildMockFrame({
    candidates: [unvalued, valued],
    fields: new Map([
      [valued.id, { phase: ['build'] }],
      [unvalued.id, { phase: ['build'] }],
    ]),
    values: new Map([[signalKey('oldest', {}), new Map([[valued.id, 99]])]]),
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      takes: { phase: ['build'] },
      order: [signalKey('oldest', {})],
    },
  ];

  const decision = decide({ frame, pools, snapshot: { limits: [], wakes: [] }, backoff: [] });

  expect(decision.picks).toStrictEqual([
    expect.objectContaining({ item: valued.id }),
    expect.objectContaining({ item: unvalued.id }),
  ]);
});

test("it sorts by the pool's later signal when the first ties", () => {
  const first = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
  });

  const second = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const frame = buildMockFrame({
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
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      takes: { phase: ['build'] },
      order: [signalKey('expedite', {}), signalKey('oldest', {})],
    },
  ];

  const decision = decide({ frame, pools, snapshot: { limits: [], wakes: [] }, backoff: [] });

  expect(decision.picks).toStrictEqual([
    expect.objectContaining({ item: second.id }),
    expect.objectContaining({ item: first.id }),
  ]);
});

test('it gives a candidate to the first pool that takes it, and never twice', () => {
  const item = buildMockFrameItem();

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('small'), takes: { phase: ['build'] }, order: [] },
    { name: brandSchemas.poolName.parse('large'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [
      {
        kind: 'start',
        item: item.id,
        phase: 'build',
        round: 1,
        pool: 'small',
        fields: { phase: ['build'] },
        limits: [],
      },
    ],
    waits: [],
  });
});

test('it picks no held candidate and gives it no wait', () => {
  const held = buildMockFrameItem();

  const frame = buildMockFrame({
    candidates: [held],
    fields: new Map([[held.id, { phase: ['build'] }]]),
    holds: new Map([[held.id, [{ gate: 'defer', reason: 'waits on a design' }]]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision).toStrictEqual({ picks: [], waits: [] });
});

test("it gives a candidate that no pool's filter takes the wait no-pool", () => {
  const item = buildMockFrameItem();

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('build'),
      takes: { phase: ['build'], area: ['maintenance'] },
      order: [],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [],
    waits: [{ subject: { kind: 'item', item: item.id }, reason: { kind: 'no-pool' } }],
  });
});

test('it starts no item that a full limit counts, and starts one that the limit does not count', () => {
  const attended = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
    phase: brandSchemas.phaseName.parse('design'),
  });

  const build = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
  });

  const frame = buildMockFrame({
    candidates: [attended, build],
    fields: new Map([
      [attended.id, { phase: ['design'], designMode: ['attended'] }],
      [build.id, { phase: ['build'], designMode: ['agent'] }],
    ]),
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('design-with-owner'),
      takes: { phase: ['design'], designMode: ['attended'] },
      order: [],
    },
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: {
      limits: [
        { name: brandSchemas.limitName.parse('workers'), max: 7, counts: {}, held: 3 },
        {
          name: brandSchemas.limitName.parse('owner-design'),
          max: 1,
          counts: { phase: ['design'], designMode: ['attended'] },
          held: 1,
        },
      ],
      wakes: [],
    },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [
      {
        kind: 'start',
        item: build.id,
        phase: 'build',
        round: 1,
        pool: 'build',
        fields: { phase: ['build'], designMode: ['agent'] },
        limits: ['workers'],
      },
    ],
    waits: [
      {
        subject: { kind: 'item', item: attended.id },
        reason: { kind: 'limit-full', limit: 'owner-design' },
      },
    ],
  });
});

test('it counts the seats of its own picks, so a limit with one free seat starts one item', () => {
  const first = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
    phase: brandSchemas.phaseName.parse('design'),
  });

  const second = buildMockFrameItem({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
    phase: brandSchemas.phaseName.parse('design'),
  });

  const frame = buildMockFrame({
    candidates: [first, second],
    fields: new Map([
      [first.id, { phase: ['design'], designMode: ['attended'] }],
      [second.id, { phase: ['design'], designMode: ['attended'] }],
    ]),
  });

  const pools: Pool[] = [
    {
      name: brandSchemas.poolName.parse('design-with-owner'),
      takes: { phase: ['design'], designMode: ['attended'] },
      order: [],
    },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: {
      limits: [
        {
          name: brandSchemas.limitName.parse('owner-design'),
          max: 1,
          counts: { phase: ['design'], designMode: ['attended'] },
          held: 0,
        },
      ],
      wakes: [],
    },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [
      {
        kind: 'start',
        item: first.id,
        phase: 'design',
        round: 1,
        pool: 'design-with-owner',
        fields: { phase: ['design'], designMode: ['attended'] },
        limits: ['owner-design'],
      },
    ],
    waits: [
      {
        subject: { kind: 'item', item: second.id },
        reason: { kind: 'limit-full', limit: 'owner-design' },
      },
    ],
  });
});

test('it starts nothing while a limit holds more seats than its max after a wake over the cap', () => {
  const item = buildMockFrameItem();

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: {
      limits: [{ name: brandSchemas.limitName.parse('workers'), max: 7, counts: {}, held: 8 }],
      wakes: [],
    },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [],
    waits: [
      {
        subject: { kind: 'item', item: item.id },
        reason: { kind: 'limit-full', limit: 'workers' },
      },
    ],
  });
});

test('it puts a wake before a start, and the wake takes the last free seat', () => {
  const item = buildMockFrameItem();
  const attempt = brandSchemas.attemptId.parse('0190a000-0000-7000-8000-0000000000a1');

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: {
      limits: [{ name: brandSchemas.limitName.parse('workers'), max: 7, counts: {}, held: 6 }],
      wakes: [
        {
          attempt,
          item: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000009'),
          phase: brandSchemas.phaseName.parse('design'),
          pool: brandSchemas.poolName.parse('design-with-owner'),
          fields: { phase: ['design'], designMode: ['attended'] },
          requestedAt: brandSchemas.instant.parse(40_000),
        },
      ],
    },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [{ kind: 'wake', attempt, limits: ['workers'] }],
    waits: [
      {
        subject: { kind: 'item', item: item.id },
        reason: { kind: 'limit-full', limit: 'workers' },
      },
    ],
  });
});

test('it gives no wake pick when a limit that counts the wake is full', () => {
  const attempt = brandSchemas.attemptId.parse('0190a000-0000-7000-8000-0000000000a1');

  const decision: unknown = decide({
    frame: buildMockFrame(),
    pools: [],
    snapshot: {
      limits: [
        {
          name: brandSchemas.limitName.parse('owner-design'),
          max: 1,
          counts: { phase: ['design'], designMode: ['attended'] },
          held: 1,
        },
      ],
      wakes: [
        {
          attempt,
          item: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000009'),
          phase: brandSchemas.phaseName.parse('design'),
          pool: brandSchemas.poolName.parse('design-with-owner'),
          fields: { phase: ['design'], designMode: ['attended'] },
          requestedAt: brandSchemas.instant.parse(40_000),
        },
      ],
    },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [],
    waits: [
      {
        subject: { kind: 'wake', attempt },
        reason: { kind: 'limit-full', limit: 'owner-design' },
      },
    ],
  });
});

test('it gives no start pick and no wake pick in a pool in backoff', () => {
  const item = buildMockFrameItem();
  const attempt = brandSchemas.attemptId.parse('0190a000-0000-7000-8000-0000000000a1');

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
    { name: brandSchemas.poolName.parse('spare'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: {
      limits: [{ name: brandSchemas.limitName.parse('workers'), max: 7, counts: {}, held: 0 }],
      wakes: [
        {
          attempt,
          item: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000009'),
          phase: brandSchemas.phaseName.parse('build'),
          pool: brandSchemas.poolName.parse('build'),
          fields: { phase: ['build'] },
          requestedAt: brandSchemas.instant.parse(40_000),
        },
      ],
    },
    backoff: [brandSchemas.poolName.parse('build')],
  });

  expect(decision).toStrictEqual({
    picks: [],
    waits: [
      { subject: { kind: 'wake', attempt }, reason: { kind: 'backoff', pool: 'build' } },
      { subject: { kind: 'item', item: item.id }, reason: { kind: 'backoff', pool: 'build' } },
    ],
  });
});

test('it starts in another pool while one pool is in backoff', () => {
  const item = buildMockFrameItem({ phase: brandSchemas.phaseName.parse('review') });

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['review'] }]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
    { name: brandSchemas.poolName.parse('review'), takes: { phase: ['review'] }, order: [] },
  ];

  const decision: unknown = decide({
    frame,
    pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [brandSchemas.poolName.parse('build')],
  });

  expect(decision).toStrictEqual({
    picks: [
      {
        kind: 'start',
        item: item.id,
        phase: 'review',
        round: 1,
        pool: 'review',
        fields: { phase: ['review'] },
        limits: [],
      },
    ],
    waits: [],
  });
});

test('it gives a start pick the round of the item', () => {
  const item = buildMockFrameItem({ round: 2 });

  const frame = buildMockFrame({
    candidates: [item],
    fields: new Map([[item.id, { phase: ['build'] }]]),
  });

  const pools: Pool[] = [
    { name: brandSchemas.poolName.parse('build'), takes: { phase: ['build'] }, order: [] },
  ];

  const decision = decide({ frame, pools, snapshot: { limits: [], wakes: [] }, backoff: [] });

  expect(decision.picks).toStrictEqual([expect.objectContaining({ kind: 'start', round: 2 })]);
});
