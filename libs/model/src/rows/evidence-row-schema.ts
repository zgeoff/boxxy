import { z } from 'zod';
import type { EvidenceRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const evidenceRowSchema: z.ZodType<EvidenceRow> = z.object({
  factId: brandSchemas.factId,
  attempt: brandSchemas.attemptId,
  kind: z.enum(['pull_request', 'commit', 'test', 'ci-run', 'live-check']),
  ref: z.string().min(1),
  observed: z.string().nullable(),
  source: z.enum(['hook', 'trailer', 'agent', 'watch']),
  at: brandSchemas.instant,
});
