import { expect, test } from 'bun:test';
import { closeOutSchema } from './close-out-schema.ts';

test.each([
  [
    'triage',
    {
      result: { kind: 'declined', reason: 'The upload page is going away' },
      relations: [],
      friction: [],
      frictionDropped: 0,
    },
  ],
  [
    'design',
    {
      result: { kind: 'blocked', reason: 'Which page keeps the button?' },
      friction: [],
      frictionDropped: 0,
    },
  ],
  [
    'build',
    {
      result: { kind: 'blocked', reason: 'The upload service is down' },
      criteria: [{ criterion: 'a1', evidence: '0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a' }],
      openItems: [],
      friction: [],
      frictionDropped: 0,
    },
  ],
  [
    'review',
    {
      verdict: { kind: 'passed' },
      noslop: {
        version: 1,
        reviewID: 'review-3c9a',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
        reportBytes: 12,
        report: { findings: [] },
      },
      friction: [],
      frictionDropped: 0,
    },
  ],
])('it keeps every field of a stored %s close-out', (_phase, closeOut) => {
  const parsed: unknown = closeOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a body that is no phase close-out', () => {
  const closeOut = { result: { kind: 'merged' }, friction: [], frictionDropped: 0 };

  expect(closeOutSchema.safeParse(closeOut).success).toBe(false);
});
