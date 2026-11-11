import { z } from 'zod';
import type { Criterion } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const criterionSchema: z.ZodType<Criterion> = z.object({
  id: brandSchemas.criterionId,
  text: z.string().min(1),
  evidence: z.array(brandSchemas.factId),
});
