import { expect, test } from 'bun:test';
import { reviewCloseOutSchema } from './review-close-out-schema.ts';

test('it accepts a later review blocked on open findings, with its unrelated lines', () => {
  const closeOut = {
    round: 2,
    cause: 'rework',
    reading: {
      status: 'blocked',
      why: 'open-findings',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      open: { high: 1, medium: 0, low: 2 },
      closedWithoutFix: 1,
      findingPaths: ['src/upload.ts'],
      cost: {
        calls: [
          {
            model: 'claude-haiku-5-5',
            input: 1200,
            cachedInput: 300,
            cacheWrite: 0,
            output: 450,
            durationMs: 9100,
          },
        ],
      },
      ref: 'review-3c9a',
      answerHint: 'Reply to each open finding.',
    },
    unrelatedLines: 14,
  };

  const parsed: unknown = reviewCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it accepts a first review that covered no head, with no unrelated lines', () => {
  const closeOut = {
    round: 1,
    cause: 'first',
    reading: {
      status: 'not-covered',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      cost: { calls: [] },
    },
    unrelatedLines: null,
  };

  const parsed: unknown = reviewCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a blocked reading with no reason', () => {
  const closeOut = {
    round: 1,
    cause: 'first',
    reading: {
      status: 'blocked',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      open: { high: 0, medium: 0, low: 0 },
      closedWithoutFix: 0,
      findingPaths: [],
      cost: { calls: [] },
      ref: 'review-3c9a',
      answerHint: '',
    },
    unrelatedLines: null,
  };

  expect(reviewCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['reading', 'why'],
  });
});
