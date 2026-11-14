import type { Report } from '@wringer/core';
import { renderReportComment, toReportComment } from '@wringer/core';

// The data comment that `bun verify publish` writes into a pull request body for the report.
export function buildMockWringerComment(report: Report): string {
  return renderReportComment(toReportComment(report, 'boxxy-verify'));
}
