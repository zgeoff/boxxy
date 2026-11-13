import { expect, test } from 'bun:test';
import { reportSchema } from '@wringer/core';
import { buildMockWringerReport } from './build-mock-wringer-report.ts';

test('it builds a report that wringer parses', () => {
  const report = buildMockWringerReport({
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'merge', status: 'stale' },
      { name: 'notices', status: 'missing' },
      { name: 'runner', status: 'unchanged' },
    ],
  });

  expect(reportSchema.parse(report)).toStrictEqual(report);
});

test('it builds a complete report when every changed feature is verified', () => {
  const report = buildMockWringerReport({
    features: [
      { name: 'item-list', status: 'verified' },
      { name: 'runner', status: 'unchanged' },
    ],
  });

  expect([report.complete, report.features.map((feature) => feature.changed)]).toStrictEqual([
    true,
    [true, false],
  ]);
});

test('it builds an incomplete report when a changed feature has no fresh verdict', () => {
  const report = buildMockWringerReport({ features: [{ name: 'merge', status: 'stale' }] });

  expect(report.complete).toBeFalse();
});
