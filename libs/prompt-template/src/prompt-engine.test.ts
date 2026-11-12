import { expect, test } from 'bun:test';
import { promptFilters, promptTags } from './constants.ts';
import { promptEngine } from './prompt-engine.ts';

test('it registers only the allowed tags', () => {
  expect(Object.keys(promptEngine.tags).toSorted()).toStrictEqual([...promptTags].toSorted());
});

test('it registers only the allowed filters', () => {
  expect(Object.keys(promptEngine.filters).toSorted()).toStrictEqual([...promptFilters].toSorted());
});
