import { expect, test } from 'bun:test';
import { toJSONValue } from './to-json-value.ts';

test('it keeps nested objects, lists and plain values', () => {
  const value = {
    title: 'Fix the lamp',
    count: 2,
    done: false,
    owner: null,
    tags: ['red', { size: 1 }],
  };

  expect(toJSONValue(value)).toStrictEqual({
    title: 'Fix the lamp',
    count: 2,
    done: false,
    owner: null,
    tags: ['red', { size: 1 }],
  });
});

test('it drops an object field that holds undefined', () => {
  expect(toJSONValue({ title: 'Fix the lamp', note: undefined })).toStrictEqual({
    title: 'Fix the lamp',
  });
});

test('it throws on a value with no JSON form', () => {
  expect(() => toJSONValue({ run: () => 1 })).toThrow();
});
