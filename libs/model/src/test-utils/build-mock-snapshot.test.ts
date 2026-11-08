import { expect, test } from 'bun:test';
import { buildMockItemView } from './build-mock-item-view.ts';
import { buildMockSnapshot } from './build-mock-snapshot.ts';

test('it builds an empty snapshot', () => {
  expect(buildMockSnapshot()).toStrictEqual({
    storeVersion: 1,
    items: [],
    links: [],
    levers: [],
    freeSlots: {},
  });
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockItemView({ title: 'Cache the parsed config' });

  expect(buildMockSnapshot({ storeVersion: 7, items: [item] })).toStrictEqual({
    storeVersion: 7,
    items: [item],
    links: [],
    levers: [],
    freeSlots: {},
  });
});
