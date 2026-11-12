import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';

// The fields of `noslop review --json --report json` that the summary reads. Every other field passes
// through unread, and a list's entries are not checked, so a newer noslop still parses.
export const noslopReportSchema = z.looseObject({
  version: z.number().int().positive(),
  reviewID: z.string().min(1),
  head: brandSchemas.commitSha,
  findings: z.array(z.unknown()),
  failedCalls: z.array(z.unknown()),
  fixChecks: z.array(z.unknown()).exactOptional(),
});
