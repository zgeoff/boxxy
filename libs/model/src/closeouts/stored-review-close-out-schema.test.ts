import { expect, test } from 'bun:test';
import { storedReviewCloseOutSchema } from './stored-review-close-out-schema.ts';

test.each([
  ['the whole result', { findings: [], failedCalls: [] }],
  ['no result', null],
])(
  'it reads a passed v1 review that kept %s as the passed reading of its head',
  (_title, report) => {
    const stored = {
      verdict: { kind: 'passed' },
      noslop: {
        version: 7,
        reviewID: 'review-3c9a',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
        reportBytes: 48_000,
        report,
      },
      friction: [{ target: { kind: 'skill', name: 'docs-writing' }, change: 'Name the doc type' }],
      frictionDropped: 0,
    };

    const parsed: unknown = storedReviewCloseOutSchema.safeParse(stored).data;

    expect(parsed).toStrictEqual({
      round: null,
      cause: null,
      reading: {
        status: 'passed',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        open: { high: 0, medium: 0, low: 0 },
        closedWithoutFix: 0,
        findingPaths: [],
        cost: { calls: [] },
        ref: 'review-3c9a',
        answerHint: '',
      },
      unrelatedLines: null,
    });
  },
);

test('it reads a v1 review that asked for changes as a reading blocked on its findings, each one open', () => {
  const stored = {
    verdict: {
      kind: 'changes-requested',
      findings: [
        { title: 'The retry runs twice', body: 'Guard it.', path: 'src/upload.ts', line: 41 },
        { title: 'The retry has no limit', body: 'Cap it.', path: 'src/upload.ts' },
        { title: 'No test of a failed upload', body: 'Add one.' },
      ],
    },
    noslop: {
      version: 7,
      reviewID: 'review-3c9a',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      counts: { findings: 3, failedCalls: 0, fixChecks: 0 },
      reportBytes: 2048,
      report: null,
    },
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = storedReviewCloseOutSchema.safeParse(stored).data;

  expect(parsed).toStrictEqual({
    round: null,
    cause: null,
    reading: {
      status: 'blocked',
      why: 'open-findings',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      open: { high: 3, medium: 0, low: 0 },
      closedWithoutFix: 0,
      findingPaths: ['src/upload.ts'],
      cost: { calls: [] },
      ref: 'review-3c9a',
      answerHint: [
        'Fix each of these findings:',
        '### The retry runs twice\nsrc/upload.ts:41\nGuard it.',
        '### The retry has no limit\nsrc/upload.ts\nCap it.',
        '### No test of a failed upload\nAdd one.',
      ].join('\n\n'),
    },
    unrelatedLines: null,
  });
});

test('it reads a v1 review it has read once as the same close-out again', () => {
  const stored = {
    verdict: { kind: 'changes-requested', findings: [{ title: 'Runs twice', body: 'Guard it.' }] },
    noslop: {
      version: 7,
      reviewID: 'review-3c9a',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      counts: { findings: 1, failedCalls: 0, fixChecks: 0 },
      reportBytes: 512,
      report: null,
    },
    friction: [],
    frictionDropped: 0,
  };

  const once = storedReviewCloseOutSchema.parse(stored);

  expect(storedReviewCloseOutSchema.safeParse(once).data).toStrictEqual(once);
});

test('it keeps every field of a close-out of the review gate', () => {
  const closeOut = {
    round: 2,
    cause: 'rework',
    reading: {
      status: 'passed',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      open: { high: 0, medium: 0, low: 1 },
      closedWithoutFix: 1,
      findingPaths: ['src/upload.ts'],
      cost: { calls: [] },
      ref: 'review-3c9a',
      answerHint: 'Reply to each open finding.',
    },
    unrelatedLines: 4,
  };

  const parsed: unknown = storedReviewCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a v1 review whose summary has no head', () => {
  const stored = {
    verdict: { kind: 'passed' },
    noslop: { version: 7, reviewID: 'review-3c9a', report: null },
    friction: [],
    frictionDropped: 0,
  };

  expect(storedReviewCloseOutSchema.safeParse(stored).success).toBe(false);
});
