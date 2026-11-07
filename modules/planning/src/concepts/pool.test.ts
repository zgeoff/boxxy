import { expect, test } from 'bun:test';
import { brandSchemas, signalKey } from '@boxxy/model';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { buildFrame } from '../build-frame.ts';
import { decide } from '../decide.ts';
import { buildMockLoadedRules } from '../test-utils/build-mock-loaded-rules.ts';

test('it gives each candidate its phase, kind and repo as filter-field values', () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView({ repo: brandSchemas.repoName.parse('acme/widgets') });
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.fields).toStrictEqual(
    new Map([[item.id, { phase: ['build'], kind: ['core.issue'], repo: ['acme/widgets'] }]]),
  );
});

test("it picks only the candidates whose filter-field values match a pool's takes", () => {
  const rules = buildMockLoadedRules({
    pools: [
      {
        name: 'widgets',
        slots: 2,
        takes: { phase: 'build', kind: ['core.issue'], repo: ['acme/widgets'] },
        order: ['oldest'],
      },
    ],
  });

  const now = brandSchemas.instant.parse(50_000);
  const widget = buildMockItemView({ repo: brandSchemas.repoName.parse('acme/widgets') });
  const gadget = buildMockItemView({ repo: brandSchemas.repoName.parse('acme/gadgets') });

  const frame = buildFrame({
    snapshot: buildMockSnapshot({ items: [gadget, widget] }),
    rules,
    now,
  });

  const decision: unknown = decide({
    frame,
    pools: [...rules.pools],
    freeSlots: { [brandSchemas.poolName.parse('widgets')]: 2 },
  });

  expect(decision).toStrictEqual({
    picks: [{ item: widget.id, phase: 'build', pool: 'widgets' }],
  });
});

test("it gives oldest the item's filed time in milliseconds", () => {
  const rules = buildMockLoadedRules();
  const now = brandSchemas.instant.parse(50_000);
  const item = buildMockItemView({ filedAt: brandSchemas.instant.parse(1234) });
  const frame = buildFrame({ snapshot: buildMockSnapshot({ items: [item] }), rules, now });

  expect(frame.values.get(signalKey('oldest', {}))).toStrictEqual(new Map([[item.id, 1234]]));
});
