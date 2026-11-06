import { expect, test } from 'bun:test';
import { contentHash } from './content-hash.ts';

test('it hashes the same value with its object keys in another order the same', () => {
  const reordered = contentHash({
    title: 'Ship it',
    tags: ['a', 'b'],
    meta: { size: 3, open: true },
  });

  expect(reordered).toBe(
    contentHash({ meta: { open: true, size: 3 }, tags: ['a', 'b'], title: 'Ship it' }),
  );
});

test('it hashes a changed value differently', () => {
  const changed = contentHash({ title: 'Ship it', meta: { size: 4 } });

  expect(changed).not.toBe(contentHash({ title: 'Ship it', meta: { size: 3 } }));
});

test('it hashes a reordered list differently', () => {
  const reordered = contentHash(['b', 'a']);

  expect(reordered).not.toBe(contentHash(['a', 'b']));
});

test('it returns the SHA-256 hex of the canonical JSON', () => {
  expect<string>(contentHash({ beta: 2, alpha: 1 })).toBe(
    '955c071f4fbee40a01b9bc6e8fb3627e81bda84811ae9c29fcc5812ba3a45162',
  );
});
