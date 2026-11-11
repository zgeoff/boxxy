import { expect, test } from 'bun:test';
import { buildBackoffMs } from './build-backoff-ms.ts';
import { outboxLimits } from './constants.ts';

test.each([
  [1, 1000],
  [2, 2000],
  [3, 4000],
  [9, 256_000],
  [10, 300_000],
  [40, 300_000],
])('it waits %d retries in a row for %d ms with no jitter', (retries, expected) => {
  expect(buildBackoffMs(retries, outboxLimits, 0.5)).toBe(expected);
});

test.each([
  [0, 800],
  [0.9, 1160],
])('it moves the wait by at most 20 percent, with a random of %d', (random, expected) => {
  expect(buildBackoffMs(1, outboxLimits, random)).toBe(expected);
});
