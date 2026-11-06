import { expect, test } from 'bun:test';
import { formatCanonicalJson } from './format-canonical-json.ts';

test('it writes the RFC 8785 sample with its numbers, strings and literals in canonical form', () => {
  const sample = {
    numbers: [1_000_000_000 / 3, 1e30, 4.5, 2e-3, 1e-27],
    string: '\u20AC$\u000F\nA\'B"\\\\"/',
    literals: [null, true, false],
  };

  expect(formatCanonicalJson(sample)).toBe(
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"\u20AC$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
  );
});

test('it sorts object keys by their UTF-16 code units, as the RFC 8785 sorting sample does', () => {
  const sample = {
    '\u20AC': 'Euro Sign',
    '\r': 'Carriage Return',
    '\uFB33': 'Hebrew Letter Dalet With Dagesh',
    '1': 'One',
    '\u{1F600}': 'Emoji: Grinning Face',
    '\u0080': 'Control',
    '\u00F6': 'Latin Small Letter O With Diaeresis',
  };

  expect(formatCanonicalJson(sample)).toBe(
    '{"\\r":"Carriage Return","1":"One","\u0080":"Control","\u00F6":"Latin Small Letter O With Diaeresis","\u20AC":"Euro Sign","\u{1F600}":"Emoji: Grinning Face","\uFB33":"Hebrew Letter Dalet With Dagesh"}',
  );
});

test('it writes negative zero as 0', () => {
  expect(formatCanonicalJson({ offset: -0 })).toBe('{"offset":0}');
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  'it throws on the number %p, which JSON cannot hold',
  (number) => {
    expect(() => formatCanonicalJson([number])).toThrow(TypeError);
  },
);

test('it throws on a string value with a lone UTF-16 surrogate', () => {
  expect(() => formatCanonicalJson({ title: 'broken \uD800 text' })).toThrow(TypeError);
});

test('it throws on an object key with a lone UTF-16 surrogate', () => {
  expect(() => formatCanonicalJson({ 'key \uDC00': 'value' })).toThrow(TypeError);
});

test('it writes a string with a surrogate pair as its character', () => {
  expect(formatCanonicalJson('\uD83D\uDE00')).toBe('"\u{1F600}"');
});

test('it throws on a sparse array', () => {
  const sparse: string[] = ['first'];

  sparse.length = 2;

  expect(() => formatCanonicalJson(sparse)).toThrow(TypeError);
});
