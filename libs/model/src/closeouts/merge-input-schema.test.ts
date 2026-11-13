import { expect, test } from 'bun:test';
import { mergeInputSchema } from './merge-input-schema.ts';

test('it reads the pull request of a stored merge input', () => {
  const input = {
    pullRequest: { repo: 'acme/lamps', number: 7, url: 'https://github.com/acme/lamps/pull/7' },
  };

  const parsed: unknown = mergeInputSchema.parse(input);

  expect(parsed).toStrictEqual(input);
});

test('it reads a merge input with no pull request', () => {
  const parsed: unknown = mergeInputSchema.parse({ pullRequest: null });

  expect(parsed).toStrictEqual({ pullRequest: null });
});

test('it refuses a merge input with no pull request field', () => {
  expect(mergeInputSchema.safeParse({}).success).toBeFalse();
});
