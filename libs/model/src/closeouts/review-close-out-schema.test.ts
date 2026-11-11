import { expect, test } from 'bun:test';
import { reviewCloseOutSchema } from './review-close-out-schema.ts';

test('it accepts a stored review that asks for changes, with the summary of the review result', () => {
  const closeOut = {
    verdict: {
      kind: 'changes-requested',
      findings: [
        {
          title: 'The retry runs twice',
          body: 'A second click sends a second upload',
          path: 'src/upload.ts',
          line: 41,
        },
      ],
    },
    noslop: {
      version: 1,
      reviewID: 'review-3c9a',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      counts: { findings: 1, failedCalls: 0, fixChecks: 0 },
      reportBytes: 2048,
      report: null,
    },
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = reviewCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a review whose summary has no counts', () => {
  const closeOut = {
    verdict: { kind: 'passed' },
    noslop: {
      version: 1,
      reviewID: 'review-3c9a',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      reportBytes: 2048,
      report: null,
    },
    friction: [],
    frictionDropped: 0,
  };

  expect(reviewCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['noslop', 'counts'],
  });
});
