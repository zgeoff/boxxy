import { expect, test } from 'bun:test';
import { reviewInputSchema } from './review-input-schema.ts';

test.each([
  [
    'a round with its pull request and command',
    {
      pullRequest: { repo: 'example/app', number: 7 },
      round: 2,
      cause: 'rework',
      command: 'noslop review --fixes-only',
    },
  ],
  ['a round with no pull request', { pullRequest: null, round: 1, cause: 'first', command: null }],
])('it reads %s', (_title, input) => {
  const parsed: unknown = reviewInputSchema.safeParse(input).data;

  expect(parsed).toStrictEqual(input);
});

test('it rejects a round of no known cause', () => {
  const input = { pullRequest: null, round: 1, cause: 'again', command: null };

  expect(reviewInputSchema.safeParse(input).error?.issues).toPartiallyContain({ path: ['cause'] });
});
