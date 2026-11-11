import { expect, test } from 'bun:test';
import { brandSchemas, signalKey } from '@boxxy/model';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildFrame } from '../build-frame.ts';
import { decide } from '../decide.ts';
import { buildMockLoadedRules } from '../test-utils/build-mock-loaded-rules.ts';

test('it gives each candidate its phase, kind, repo and design mode as filter-field values', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);

  const item = buildMockV1ItemView({
    repo: brandSchemas.repoName.parse('acme/widgets'),
    fields: { designMode: 'attended' },
  });

  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.fields).toStrictEqual(
    new Map([
      [
        item.id,
        {
          phase: ['build'],
          kind: ['core.issue'],
          repo: ['acme/widgets'],
          designMode: ['attended'],
        },
      ],
    ]),
  );
});

test('it gives an item that sets no design mode the design mode agent', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockV1ItemView({ fields: {} });
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.fields.get(item.id)).toStrictEqual(
    expect.objectContaining({ designMode: ['agent'] }),
  );
});

test('it starts a design item that sets no design mode in the agent design pool', () => {
  const rules = buildMockLoadedRules({
    pools: [
      {
        name: 'design-with-owner',
        takes: { phase: 'design', designMode: 'attended' },
        order: ['oldest'],
      },
      { name: 'design', takes: { phase: 'design', designMode: 'agent' }, order: ['oldest'] },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);

  const item = buildMockV1ItemView({
    fields: {},
    position: { kind: 'phase', phase: brandSchemas.phaseName.parse('design'), round: 1 },
  });

  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  const decision = decide({
    frame,
    pools: rules.pools,
    snapshot: { limits: [], wakes: [] },
    backoff: [],
  });

  expect(decision).toStrictEqual({
    picks: [expect.objectContaining({ kind: 'start', item: item.id, pool: 'design' })],
    waits: [],
  });
});

test("it picks only the candidates whose filter-field values match a pool's takes", () => {
  const rules = buildMockLoadedRules({
    pools: [
      {
        name: 'widgets',
        takes: { phase: 'build', kind: ['core.issue'], repo: ['acme/widgets'] },
        order: ['oldest'],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const widget = buildMockV1ItemView({ repo: brandSchemas.repoName.parse('acme/widgets') });
  const gadget = buildMockV1ItemView({ repo: brandSchemas.repoName.parse('acme/gadgets') });

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [gadget, widget] }),
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
    expect.objectContaining({ kind: 'start', item: widget.id, pool: 'widgets' }),
  ]);
});

test("it gives oldest the item's filed time in milliseconds", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockV1ItemView({ filedAt: brandSchemas.instant.parse(1234) });
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.values.get(signalKey('oldest', {}))).toStrictEqual(new Map([[item.id, 1234]]));
});
