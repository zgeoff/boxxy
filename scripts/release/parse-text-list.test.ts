import { expect, test } from 'bun:test';
import { parseTextList } from './parse-text-list.ts';

test('it returns the values of a JSON list of text', () => {
  const values = parseTextList('["libs/std","libs/tsconfig"]');

  expect(values).toStrictEqual(['libs/std', 'libs/tsconfig']);
});

test.each([
  ['text that is not JSON', 'libs/std'],
  ['a JSON object', '{"path":"libs/std"}'],
  ['a value that is not text', '["libs/std",1]'],
])('it returns null for %s', (_label, text) => {
  const values = parseTextList(text);

  expect(values).toBeNull();
});
