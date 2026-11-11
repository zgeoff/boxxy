import { expect, test } from 'bun:test';
import { buildMockFrameItem } from './build-mock-frame-item.ts';
import { buildMockFrame } from './build-mock-frame.ts';

test('it builds an empty frame', () => {
  expect(buildMockFrame()).toStrictEqual({
    candidates: [],
    fields: new Map(),
    values: new Map(),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockFrameItem();

  expect(buildMockFrame({ candidates: [item] })).toStrictEqual({
    candidates: [item],
    fields: new Map(),
    values: new Map(),
    holds: new Map(),
    lifted: new Map(),
    faults: [],
  });
});
