import { expect, test } from 'bun:test';
import { formatKeyPath } from './format-key-path.ts';

test('it joins keys with dots and indexes with brackets', () => {
  expect(formatKeyPath(['friction', 0, 'target', 'kind'])).toBe('friction[0].target.kind');
});

test('it quotes a key that is not a plain name', () => {
  expect(formatKeyPath(['pools', 'big pool', 'order'])).toBe('pools["big pool"].order');
});

test('it formats an empty path as an empty string', () => {
  expect(formatKeyPath([])).toBe('');
});
