import { expect, test } from 'bun:test';
import { noslopReportSchema } from '../noslop/noslop-report-schema.ts';
import { buildMockNoslopReport } from './build-mock-noslop-report.ts';

test('it builds a report that the noslop report schema accepts whole', () => {
  const report = buildMockNoslopReport();

  expect(noslopReportSchema.parse(report)).toStrictEqual(report);
});

test('it applies the overrides it is given', () => {
  const report = buildMockNoslopReport({ findings: [{ title: 'The retry runs twice' }] });

  expect(report.findings).toStrictEqual([{ title: 'The retry runs twice' }]);
});
