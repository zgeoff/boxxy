import { expect, test } from 'bun:test';
import { noticeRowSchema } from './notice-row-schema.ts';

test.each(['attempts used up', 'declined'])('it accepts a notice of the hold %s', (reason) => {
  const row = {
    id: 4,
    kind: 'hold',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    reason,
    pause: null,
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

test('it accepts a notice of a paused runner', () => {
  const row = {
    id: 5,
    kind: 'runner-paused',
    item: null,
    reason: null,
    pause: {
      pausedAt: 500,
      pausedBy: 'boxxy:owner:local',
      reason: 'rules change in review',
      waiting: 3,
    },
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

test('it rejects a hold notice with a negative count of tries', () => {
  const row = {
    id: 4,
    kind: 'hold',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    reason: 'declined',
    pause: null,
    at: 1000,
    tries: -1,
    sentAt: null,
    keySeq: 0,
    keyTries: 0,
    nextTryAt: 1000,
  };

  expect(noticeRowSchema.safeParse(row).error?.issues).toPartiallyContain({
    path: ['tries'],
  });
});

test('it accepts a notify notice with its phase and reason', () => {
  const row = {
    id: 6,
    kind: 'notify',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    phase: 'live',
    reason: 'wait-skip:shipped',
    pause: null,
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
