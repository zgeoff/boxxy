import type { NoslopSummary } from '@boxxy/model';
import { toJSONValue } from '@boxxy/model';
import { closeOutLimits } from '../close-out-limits.ts';
import { measureJsonBytes } from '../measure-json-bytes.ts';
import type { NoslopReport } from '../types.ts';

// Keeps the counts of noslop's result, and the result whole only when it fits the limit: a cut
// part of the JSON would be no report at all.
export function buildNoslopSummary(report: NoslopReport): NoslopSummary {
  const whole = toJSONValue(report);
  const reportBytes = measureJsonBytes(whole);

  return {
    version: report.version,
    reviewID: report.reviewID,
    head: report.head,
    counts: {
      findings: report.findings.length,
      failedCalls: report.failedCalls.length,
      fixChecks: report.fixChecks?.length ?? 0,
    },
    reportBytes,
    report: reportBytes <= closeOutLimits.noslopReportBytes ? whole : null,
  };
}
