import { expect, test } from 'bun:test';
import { liveInputSchema } from './live-input-schema.ts';

test.each([
  [
    'the input of a live attempt',
    {
      pullRequest: {
        repo: 'example/app',
        number: 12,
        url: 'https://github.com/example/app/pull/12',
      },
      commit: '3f2a91c0d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9',
      shipped: {
        itemId: '01900000-0000-7000-8000-000000000001',
        commit: '3f2a91c0d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9',
        rule: 'release',
        ref: 'v1.0.0',
        seenAt: 1000,
      },
      criteria: [{ id: 'a1', text: 'The page loads', tags: ['prod'] }],
    },
  ],
  [
    'an input with no pull request, commit or shipped row',
    { pullRequest: null, commit: null, shipped: null, criteria: [] },
  ],
])('it parses %s', (_title, input) => {
  const parsed: unknown = liveInputSchema.parse(input);

  expect(parsed).toStrictEqual(input);
});
