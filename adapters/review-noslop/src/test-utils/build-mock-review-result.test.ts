import { expect, test } from 'bun:test';
import { reviewResultSchema } from '@noslop/cli';
import { buildMockReviewResult } from './build-mock-review-result.ts';

test('it builds a review result that noslop parses', () => {
  const result = buildMockReviewResult({
    owner: 'example',
    repo: 'app',
    number: 7,
    findings: [{ id: '00000000000000f1', severity: 'P2', path: 'src/theme.ts' }],
    failedCalls: 1,
    fixesOnly: { fixChecks: [{ findingID: '00000000000000f0', fixed: true }] },
  });

  expect(reviewResultSchema.parse(result)).toStrictEqual(result);
});

test('it builds a full review with no findings, no failed call and no fix checks by default', () => {
  const result = buildMockReviewResult({ owner: 'example', repo: 'app', number: 7 });

  expect([
    result.pullRequest,
    result.findings,
    result.failedCalls,
    'fixesOnly' in result,
  ]).toStrictEqual([{ owner: 'example', repo: 'app', number: 7 }, [], [], false]);
});
