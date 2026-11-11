import { expect, test } from 'bun:test';
import { normaliseTitle } from './normalise-title.ts';

test('it lowercases, trims and collapses each run of whitespace to one space', () => {
  expect(normaliseTitle('  Retry a\tFailed \n\n Download  ')).toBe('retry a failed download');
});
