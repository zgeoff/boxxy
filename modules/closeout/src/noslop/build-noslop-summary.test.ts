import { expect, test } from 'bun:test';
import { buildMockNoslopReport } from '../test-utils/build-mock-noslop-report.ts';
import { buildNoslopSummary } from './build-noslop-summary.ts';
import { noslopReportSchema } from './noslop-report-schema.ts';

test('it keeps the whole report with its counts when the report is within 32,768 bytes', () => {
  const report = buildMockNoslopReport({
    findings: [{ title: 'The retry runs twice' }, { title: 'The log has no attempt id' }],
    failedCalls: [{ id: 'call-2', reason: 'timed out' }],
    fixChecks: [{ findingID: '0f3a9c2b7d1e4f60', fixed: true, reason: 'Retries once now' }],
  });

  const summary: unknown = buildNoslopSummary(report);

  expect(summary).toStrictEqual({
    version: 7,
    reviewID: report.reviewID,
    head: report.head,
    counts: { findings: 2, failedCalls: 1, fixChecks: 1 },
    reportBytes: new TextEncoder().encode(JSON.stringify(report)).length,
    report,
  });
});

test('it keeps no part of a report over 32,768 bytes, and keeps its counts and size', () => {
  const report = buildMockNoslopReport({ title: 'x'.repeat(40_000) });
  const summary: unknown = buildNoslopSummary(report);

  expect(summary).toStrictEqual({
    version: 7,
    reviewID: report.reviewID,
    head: report.head,
    counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
    reportBytes: new TextEncoder().encode(JSON.stringify(report)).length,
    report: null,
  });
});

test('it keeps a report of exactly 32,768 bytes whole', () => {
  const empty = buildMockNoslopReport({ title: '' });
  const padBytes = 32_768 - new TextEncoder().encode(JSON.stringify(empty)).length;
  const report = { ...empty, title: 'x'.repeat(padBytes) };
  const kept: unknown = buildNoslopSummary(report).report;

  expect(kept).toStrictEqual(report);
});

test('it keeps a field that the schema does not name, and counts no fix checks when none are listed', () => {
  const sent = buildMockNoslopReport({ resolutionChecks: [{ sound: true }] });
  const report = noslopReportSchema.parse(sent);
  const summary: unknown = buildNoslopSummary(report);

  expect(summary).toStrictEqual({
    version: 7,
    reviewID: sent.reviewID,
    head: sent.head,
    counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
    reportBytes: new TextEncoder().encode(JSON.stringify(sent)).length,
    report: sent,
  });
});
