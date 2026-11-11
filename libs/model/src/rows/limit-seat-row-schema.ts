import { z } from 'zod';
import type { LimitSeatRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const limitSeatRowSchema: z.ZodType<LimitSeatRow> = z.object({
  limit: brandSchemas.limitName,
  attempt: brandSchemas.attemptId,
  holdGen: z.number().int().positive(),
  overCap: z.boolean(),
  takenAt: brandSchemas.instant,
  releasedAt: brandSchemas.instant.nullable(),
});
