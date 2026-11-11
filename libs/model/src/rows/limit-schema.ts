import { z } from 'zod';
import type { Limit } from '../planning/types.ts';
import { brandSchemas } from './brand-schemas.ts';

const filterSchema = z.record(z.string(), z.array(z.string()));

// A limit as the store keeps it from the last sync of the loaded limits.
export const limitSchema: z.ZodType<Limit> = z.object({
  name: brandSchemas.limitName,
  max: z.number().int().nonnegative(),
  counts: filterSchema,
});
