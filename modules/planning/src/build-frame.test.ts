import { expect, test } from 'bun:test';
import { brandSchemas, defineGate, defineSignal, signalKey } from '@boxxy/model';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { buildMockLeverRow } from '@boxxy/model/test-utils/build-mock-lever-row';
import { buildMockRelationRow } from '@boxxy/model/test-utils/build-mock-relation-row';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { z } from 'zod';
import { buildFrame } from './build-frame.ts';
import { expedite as expediteConcept } from './concepts/expedite.ts';
import { pool as poolConcept } from './concepts/pool.ts';
import { buildMockLoadedRules } from './test-utils/build-mock-loaded-rules.ts';

test('it makes candidates of the ready items only', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const ready = buildMockItemView();
  const blocked = buildMockItemView({ derived: { state: 'blocked' } });
  const running = buildMockItemView({ derived: { state: 'running' } });

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [blocked, ready, running] }),
    rules,
    now,
  });

  expect(frame.candidates).toStrictEqual([
    { ...ready, phase: brandSchemas.phaseName.parse('build') },
  ]);
});

test('it leaves out an item whose kind the rules do not name', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const issue = buildMockItemView();
  const chore = buildMockItemView({ kind: brandSchemas.itemKindName.parse('core.chore') });
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [chore, issue] }), rules, now });

  expect(frame.candidates).toStrictEqual([
    { ...issue, phase: brandSchemas.phaseName.parse('build') },
  ]);
});

test('it holds an item with the fault as its reason when a gate throws', () => {
  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'quiet',
        version: 1,
        gates: [
          defineGate({
            name: 'quiet',
            liftable: true,
            params: z.object({}),
            hold: () => {
              throw new Error('the quiet window is not set');
            },
          }),
        ],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect({ holds: frame.holds, faults: frame.faults }).toStrictEqual({
    holds: new Map([[item.id, [{ gate: 'quiet', reason: 'the quiet window is not set' }]]]),
    faults: [
      { plugin: 'quiet', kind: 'gate', item: item.id, error: 'the quiet window is not set' },
    ],
  });
});

test('it lets no waiver lift the hold of a gate that threw', () => {
  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'quiet',
        version: 1,
        gates: [
          defineGate({
            name: 'quiet',
            liftable: true,
            params: z.object({}),
            hold: () => {
              throw new Error('the quiet window is not set');
            },
          }),
        ],
        waivers: [
          {
            name: 'always-lifts-quiet',
            lifts: 'quiet',
            lift: () => ({ waiver: 'always-lifts-quiet', gate: 'quiet', reason: 'always' }),
          },
        ],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect({ holds: frame.holds, lifted: frame.lifted }).toStrictEqual({
    holds: new Map([[item.id, [{ gate: 'quiet', reason: 'the quiet window is not set' }]]]),
    lifted: new Map(),
  });
});

test('it records only the first waiver that lifts a hold', () => {
  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'parked',
        version: 1,
        gates: [
          defineGate({
            name: 'parked',
            liftable: true,
            params: z.object({}),
            hold: () => ({ gate: 'parked', reason: 'parked by hand' }),
          }),
        ],
        waivers: [
          {
            name: 'unpark-by-owner',
            lifts: 'parked',
            lift: () => ({
              waiver: 'unpark-by-owner',
              gate: 'parked',
              reason: 'the owner unparked it',
            }),
          },
          {
            name: 'unpark-by-age',
            lifts: 'parked',
            lift: () => ({ waiver: 'unpark-by-age', gate: 'parked', reason: 'parked too long' }),
          },
        ],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.lifted).toStrictEqual(
    new Map([
      [item.id, [{ waiver: 'unpark-by-owner', gate: 'parked', reason: 'the owner unparked it' }]],
    ]),
  );
});

test('it lets no waiver lift the hold of a gate that is not liftable', () => {
  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'attended',
        version: 1,
        gates: [
          defineGate({
            name: 'attended',
            liftable: false,
            params: z.object({}),
            hold: () => ({ gate: 'attended', reason: 'needs the owner present' }),
          }),
        ],
        waivers: [
          {
            name: 'always-lifts-attended',
            lifts: 'attended',
            lift: () => ({ waiver: 'always-lifts-attended', gate: 'attended', reason: 'always' }),
          },
        ],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.holds).toStrictEqual(
    new Map([[item.id, [{ gate: 'attended', reason: 'needs the owner present' }]]]),
  );
});

test('it keeps the hold and records a fault when a waiver throws', () => {
  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'parked',
        version: 1,
        gates: [
          defineGate({
            name: 'parked',
            liftable: true,
            params: z.object({}),
            hold: () => ({ gate: 'parked', reason: 'parked by hand' }),
          }),
        ],
        waivers: [
          {
            name: 'unpark',
            lifts: 'parked',
            lift: () => {
              throw new Error('the unpark list is empty');
            },
          },
        ],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView();
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect({ holds: frame.holds, lifted: frame.lifted, faults: frame.faults }).toStrictEqual({
    holds: new Map([[item.id, [{ gate: 'parked', reason: 'parked by hand' }]]]),
    lifted: new Map(),
    faults: [
      { plugin: 'unpark', kind: 'waiver', item: item.id, error: 'the unpark list is empty' },
    ],
  });
});

test('it gives no value and records a fault when a signal throws for an item', () => {
  const failing = buildMockItemView();
  const working = buildMockItemView();

  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'size',
        version: 1,
        signals: [
          defineSignal({
            name: 'size',
            params: z.object({}),
            value: (item) => {
              if (item.id === failing.id) {
                throw new Error('the size label is malformed');
              }

              return 3;
            },
          }),
        ],
      },
    ],
    pools: [{ name: 'build', takes: { phase: 'build' }, order: ['size'] }],
  });

  const now = brandSchemas.instant.parse(50_000);

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [failing, working] }),
    rules,
    now,
  });

  expect({ values: frame.values.get(signalKey('size', {})), faults: frame.faults }).toStrictEqual({
    values: new Map([[working.id, 3]]),
    faults: [
      { plugin: 'size', kind: 'signal', item: failing.id, error: 'the size label is malformed' },
    ],
  });
});

test('it gives no value for a filter field that throws, and records a fault', () => {
  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      expediteConcept,
      {
        name: 'area',
        version: 1,
        filterFields: [
          {
            name: 'area',
            value: () => {
              throw new Error('the area map has no entry');
            },
          },
        ],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView({ repo: brandSchemas.repoName.parse('acme/widgets') });
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect({ fields: frame.fields, faults: frame.faults }).toStrictEqual({
    fields: new Map([
      [item.id, { phase: ['build'], kind: ['core.issue'], repo: ['acme/widgets'] }],
    ]),
    faults: [
      { plugin: 'area', kind: 'filter-field', item: item.id, error: 'the area map has no entry' },
    ],
  });
});

test('it carries nothing and records a fault when a propagation line throws', () => {
  const blocked = buildMockItemView({ derived: { state: 'blocked' } });
  const blocker = buildMockItemView();

  const rules = buildMockLoadedRules({
    concepts: [
      poolConcept,
      {
        name: 'boost',
        version: 1,
        signals: [
          defineSignal({
            name: 'boost',
            params: z.object({}),
            value: (item) => (item.id === blocked.id ? 1 : 7),
            combine: () => {
              throw new Error('the boost values cannot combine');
            },
          }),
        ],
      },
    ],
    lead: ['boost'],
    propagation: [{ value: 'boost', over: 'blocks', toward: 'source' }],
  });

  const now = brandSchemas.instant.parse(50_000);

  const frame = buildFrame({
    snapshot: buildMockSnapshot({
      items: [blocked, blocker],
      relations: [buildMockRelationRow({ source: blocker.id, target: blocked.id })],
    }),
    rules,
    now,
  });

  expect({ values: frame.values.get(signalKey('boost', {})), faults: frame.faults }).toStrictEqual({
    values: new Map([
      [blocked.id, 1],
      [blocker.id, 7],
    ]),
    faults: [
      {
        plugin: 'propagation:boost:blocks',
        kind: 'propagation',
        item: null,
        error: 'the boost values cannot combine',
      },
    ],
  });
});

test("it combines carried values with the blocker's own value by the signal's combine", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const first = buildMockItemView({ derived: { state: 'blocked' } });
  const blocker = buildMockItemView();
  const last = buildMockItemView({ derived: { state: 'blocked' } });

  const frame = buildFrame({
    snapshot: buildMockSnapshot({
      items: [first, blocker, last],
      relations: [
        buildMockRelationRow({ source: blocker.id, target: first.id }),
        buildMockRelationRow({ source: blocker.id, target: last.id }),
      ],
      levers: [
        buildMockLeverRow({ seq: 1, kind: 'plan.expedite', item: first.id }),
        buildMockLeverRow({ seq: 2, kind: 'plan.expedite', item: blocker.id }),
        buildMockLeverRow({ seq: 3, kind: 'plan.expedite', item: last.id }),
      ],
    }),
    rules,
    now,
  });

  expect(frame.values.get(signalKey('expedite', {}))).toStrictEqual(
    new Map([
      [first.id, 0],
      [blocker.id, 0],
      [last.id, 2],
    ]),
  );
});

test('it carries a value through a chain of blockers and stops on a cycle', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const blocked = buildMockItemView({ derived: { state: 'blocked' } });
  const middle = buildMockItemView({ derived: { state: 'blocked' } });
  const root = buildMockItemView({ derived: { state: 'blocked' } });

  const frame = buildFrame({
    snapshot: buildMockSnapshot({
      items: [blocked, middle, root],
      relations: [
        buildMockRelationRow({ source: middle.id, target: blocked.id }),
        buildMockRelationRow({ source: root.id, target: middle.id }),
        buildMockRelationRow({ source: blocked.id, target: root.id }),
      ],
      levers: [buildMockLeverRow({ seq: 1, kind: 'plan.expedite', item: blocked.id })],
    }),
    rules,
    now,
  });

  expect(frame.values.get(signalKey('expedite', {}))).toStrictEqual(
    new Map([
      [blocked.id, 0],
      [middle.id, 0],
      [root.id, 0],
    ]),
  );
});
