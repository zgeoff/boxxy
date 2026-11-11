import { expect, test } from 'bun:test';
import { toWireJSON } from './to-wire-json.ts';

test.each([
  [null],
  [true],
  [42],
  ['text'],
  [[1, 'two', null]],
  [{ outer: { inner: [true, { deep: 'value' }] } }],
])('it copies the JSON value %p unchanged', (value) => {
  expect(toWireJSON(value)).toStrictEqual(value);
});

test('it gives a copy whose arrays are not the stored ones', () => {
  const stored = [1, 2];

  expect(toWireJSON(stored)).not.toBe(stored);
});
