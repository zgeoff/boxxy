import { expect, test } from 'bun:test';
import { findItemEntityID } from './find-item-entity-id.ts';

test('it gives the entity ID of a boxxy item', () => {
  expect<string | undefined>(
    findItemEntityID('boxxy:item:0193a1b2-0000-7000-8000-000000000001'),
  ).toBe('boxxy:item:0193a1b2-0000-7000-8000-000000000001');
});

test.each([
  ['an entity of another kind', 'boxxy:attempt:0193a1b2-0000-7000-8000-0000000000a1'],
  ['an entity of another source', 'github:item:9001'],
  ['text with no kind', 'boxxy-item'],
  ['an empty ID', 'boxxy:item:'],
])('it gives undefined for %s', (_case, text) => {
  expect(findItemEntityID(text)).toBeUndefined();
});
