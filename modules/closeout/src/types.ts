import type { z } from 'zod';
import type { noslopReportSchema } from './noslop/noslop-report-schema.ts';

export interface CloseOutLimits {
  // a close-out as stored, in any phase
  readonly closeOutBytes: 120_000;

  // the most of noslop's result that a review close-out keeps whole
  readonly noslopReportBytes: 32_768;
}

// What `noslop review --json --report json` printed, as the review session sends it
export type NoslopReport = z.output<typeof noslopReportSchema>;
