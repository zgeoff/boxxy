import { expect, test } from 'bun:test';
import { noticeRowSchema } from './notice-row-schema.ts';

test.each(['attempts used up', 'declined'])('it accepts a notice of the hold %s', (reason) => {
  const row = {
    id: 4,
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    reason,
    at: 1000,
    tries: 0,
    sentAt: null,
    keySeq: 0,
    keyTries: 0,
    nextTryAt: 1000,
  };

  const parsed: unknown = noticeRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a notice with a negative count of tries', () => {
  expect(noticeRowSchema.safeParse({ tries: -1 }).error?.issues).toPartiallyContain({
    path: ['tries'],
  });
});
