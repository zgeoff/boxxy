import { expect, test } from 'bun:test';
import { verifyReadingSchema } from './verify-reading-schema.ts';

test('it reads a verified reading with its features', () => {
  const reading = {
    status: 'verified',
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    features: [{ name: 'file-item', status: 'verified' }],
  };

  const parsed: unknown = verifyReadingSchema.parse(reading);

  expect(parsed).toStrictEqual(reading);
});

test('it drops the features of a not-covered reading', () => {
  const head = 'e83c5163316f89bfbde7d9ab23ca2e25604af290';
  const parsed: unknown = verifyReadingSchema.parse({ status: 'not-covered', head, features: [] });

  expect(parsed).toStrictEqual({ status: 'not-covered', head });
});

test('it refuses a feature status that wringer never reports', () => {
  const reading = {
    status: 'incomplete',
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    features: [{ name: 'file-item', status: 'red' }],
  };

  expect(verifyReadingSchema.safeParse(reading).success).toBeFalse();
});

test('it keeps the note of an incomplete reading', () => {
  const reading = {
    status: 'incomplete',
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    features: [],
    note: 'The PR body holds a version 1 report. Run `bun verify publish` again.',
  };

  const parsed: unknown = verifyReadingSchema.parse(reading);

  expect(parsed).toStrictEqual(reading);
});
