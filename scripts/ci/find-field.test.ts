import { expect, test } from 'bun:test';
import { findField } from './find-field.ts';

test('#findField returns the value of a field the object holds', () => {
  expect(findField({ base: { ref: 'main' } }, 'base')).toStrictEqual({ ref: 'main' });
});

test.each([
  ['a missing field', { body: 'text' }],
  ['null', null],
  ['a string', 'base'],
  ['an array', ['base']],
])('#findField returns undefined for %s', (_name, value) => {
  expect(findField(value, 'base')).toBeUndefined();
});
