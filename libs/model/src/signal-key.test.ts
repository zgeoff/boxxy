import { expect, test } from 'bun:test';
import { contentHash } from '@boxxy/content-hash';
import { signalKey } from './signal-key.ts';

test('it joins the signal name and the content hash of its parameters with #', () => {
  expect(signalKey('kind-order', { order: ['chore', 'bug'] })).toBe(
    `kind-order#${contentHash({ order: ['chore', 'bug'] })}`,
  );
});

test('it gives a bare name the key of empty parameters', () => {
  expect(signalKey('expedite', {})).toBe(`expedite#${contentHash({})}`);
});

test('it gives the same key to parameters with their keys in another order', () => {
  const reordered = signalKey('window', { from: 1, to: 2 });

  expect(reordered).toBe(signalKey('window', { to: 2, from: 1 }));
});
