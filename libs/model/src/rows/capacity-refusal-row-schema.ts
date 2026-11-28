import { z } from 'zod';
import type { CapacityRefusalRow } from '../ports/capacity-refusals.ts';
import { brandSchemas } from './brand-schemas.ts';
import { refusalDetailSchema } from './refusal-detail-schema.ts';

export const capacityRefusalRowSchema: z.ZodType<CapacityRefusalRow> = z.object({
  id: brandSchemas.capacityRefusalId,
  attempt: brandSchemas.attemptId,
  item: brandSchemas.itemId,
  phase: brandSchemas.phaseName,
  pool: brandSchemas.poolName,
  at: brandSchemas.instant,
  refusal: refusalDetailSchema.nullable(),
});
