import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { collectAttemptTrailers } from './collect-attempt-trailers.ts';

test('it collects each Boxxy-Attempt trailer in order', () => {
  const message =
    'Fix the lamp\n\nBoxxy-Attempt: 0190a6f4-0000-7000-8000-000000000001\nboxxy-attempt:0190a6f4-0000-7000-8000-000000000002\n';

  expect(collectAttemptTrailers(message)).toStrictEqual([
    brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-000000000001'),
    brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-000000000002'),
  ]);
});

test('it leaves out a trailer whose value is not an attempt ID', () => {
  expect(collectAttemptTrailers('Fix\n\nBoxxy-Attempt: not-an-id')).toStrictEqual([]);
});

test('it ignores a trailer name inside a line of prose', () => {
  expect(
    collectAttemptTrailers('See Boxxy-Attempt: 0190a6f4-0000-7000-8000-000000000001 for the run'),
  ).toStrictEqual([]);
});
