import { expect, test } from 'bun:test';
import { buildMockSnapshot } from './build-mock-snapshot.ts';
import { buildMockV1ItemView } from './build-mock-v1-item-view.ts';

test('it builds an empty snapshot', () => {
  expect(buildMockSnapshot()).toStrictEqual({
    storeVersion: 1,
    items: [],
    relations: [],
    levers: [],
    limits: [],
    wakes: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockV1ItemView({ title: 'Cache the parsed config' });

  expect(buildMockSnapshot({ storeVersion: 7, items: [item] })).toStrictEqual({
    storeVersion: 7,
    items: [item],
    relations: [],
    levers: [],
    limits: [],
    wakes: [],
  });
});
