import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { LimitFill } from './types.ts';

const filterSchema = z.record(z.string(), z.array(z.string()));

export const limitFillSchema: z.ZodType<LimitFill> = z.object({
  name: brandSchemas.limitName,
  max: z.number().int().nonnegative(),
  counts: filterSchema,
  held: z.number().int().nonnegative(),
});
