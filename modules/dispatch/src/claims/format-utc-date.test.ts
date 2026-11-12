import { expect, test } from 'bun:test';
import { formatUTCDate } from './format-utc-date.ts';

test.each([
  ['the epoch', 0, '1970-01-01'],
  ['the last millisecond of a day', 86_399_999, '1970-01-01'],
  ['a leap day', 1_709_164_800_000, '2024-02-29'],
  ['the day after a leap day', 1_709_251_200_000, '2024-03-01'],
  ['the end of a year', 1_767_225_599_999, '2025-12-31'],
])('it formats %s as a UTC date', (_name, instantMs, expected) => {
  expect(formatUTCDate(instantMs)).toBe(expected);
});
