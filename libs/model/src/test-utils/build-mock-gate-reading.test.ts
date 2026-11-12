import { expect, test } from 'bun:test';
import { gateReadingSchema } from '../closeouts/review-close-out-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockGateReading } from './build-mock-gate-reading.ts';

test.each([
  ['passed', { status: 'passed' }],
  ['blocked', { status: 'blocked', why: 'open-findings' }],
  ['not-covered', { status: 'not-covered' }],
] as const)('it builds a %s reading that the stored schema reads', (_status, input) => {
  const reading = buildMockGateReading(input);
  const parsed: unknown = gateReadingSchema.safeParse(reading).data;

  expect(parsed).toStrictEqual(reading);
});

test('it keeps the head and the open counts it is given', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const reading = buildMockGateReading({
    status: 'blocked',
    why: 'open-findings',
    head,
    open: { high: 1, medium: 0, low: 0 },
  });

  expect(reading).toStrictEqual({
    status: 'blocked',
    why: 'open-findings',
    head,
    open: { high: 1, medium: 0, low: 0 },
    closedWithoutFix: 0,
    findingPaths: [],
    cost: { calls: [] },
    ref: expect.stringMatching(/^review-/u),
    answerHint: 'Reply to each open finding with a disposition.',
  });
});
