import { expect, test } from 'bun:test';
import { measureJsonBytes } from './measure-json-bytes.ts';

test('it counts the UTF-8 bytes of the JSON, escapes included', () => {
  expect(measureJsonBytes({ note: 'é"' })).toBe(15);
});
