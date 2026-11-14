import { expect, test } from 'bun:test';
import { parseReportComment } from '@wringer/core';
import { buildMockWringerComment } from './build-mock-wringer-comment.ts';
import { buildMockWringerReport } from './build-mock-wringer-report.ts';

test('it builds a comment that wringer reads, with a claim for each verdict', () => {
  const report = buildMockWringerReport({
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'runner', status: 'unchanged' },
    ],
  });

  const read = parseReportComment(buildMockWringerComment(report));

  expect(read.ok && read.comment.claims.map((claim) => claim.feature)).toStrictEqual(['item-list']);
});
