import { z } from 'zod';
import type { LeaseRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const leaseRowSchema: z.ZodType<LeaseRow> = z.object({
  item: brandSchemas.itemId,
  phase: brandSchemas.phaseName,
  attempt: brandSchemas.attemptId,
  gen: z.number().int().nonnegative(),
  takenAt: brandSchemas.instant,
  releasedAt: brandSchemas.instant.nullable(),
});
