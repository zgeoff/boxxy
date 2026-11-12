import { expect, test } from 'bun:test';
import { verifyInputSchema } from './verify-input-schema.ts';

test.each([
  [
    'a verify of a pull request at the head its review passed',
    {
      pullRequest: { repo: 'example/app', number: 7, url: 'https://github.com/example/app/pull/7' },
      head: '3f2a91c0d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9',
      session: 'builder',
    },
  ],
  ['a verify with no pull request', { pullRequest: null, head: null, session: 'fresh' }],
])('it reads %s', (_title, input) => {
  const parsed: unknown = verifyInputSchema.safeParse(input).data;

  expect(parsed).toStrictEqual(input);
});

test('it rejects a verify input with no grader session', () => {
  const input = { pullRequest: null, head: null };

  expect(verifyInputSchema.safeParse(input).error?.issues).toPartiallyContain({
    path: ['session'],
  });
});
