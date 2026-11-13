import { expect, test } from 'bun:test';
import { mergeCloseOutSchema } from './merge-close-out-schema.ts';

test('it accepts a merge that boxxy merged, with the verify reading it used', () => {
  const closeOut = {
    outcome: 'merged',
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    required: ['pr / checks', 'verify / gate'],
    failed: [],
    cause: null,
    mergeCommit: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    reason: null,
    byBoxxy: true,
    verify: {
      status: 'verified',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      features: [{ name: 'upload-retry', status: 'verified' }],
    },
  };

  const parsed: unknown = mergeCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it accepts a blocked merge with no head, no verify reading and the reason', () => {
  const closeOut = {
    outcome: 'blocked',
    head: null,
    required: [],
    failed: [],
    cause: null,
    mergeCommit: null,
    reason: 'the item has no pull request',
    byBoxxy: false,
    verify: null,
  };

  const parsed: unknown = mergeCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a merge outcome that the merge step never gives', () => {
  const closeOut = {
    outcome: 'abandoned',
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    required: ['pr / checks'],
    failed: [],
    cause: null,
    mergeCommit: null,
    reason: null,
    byBoxxy: false,
    verify: { status: 'not-covered', head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290' },
  };

  expect(mergeCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['outcome'],
  });
});
