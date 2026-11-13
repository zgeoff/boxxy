import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { VerifyReading } from './types.ts';

const featureSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['verified', 'stale', 'missing', 'unchanged']),
});

export const verifyReadingSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.enum(['verified', 'incomplete']),
    head: brandSchemas.commitSha,
    features: z.array(featureSchema),
  }),
  z.object({ status: z.literal('not-covered'), head: brandSchemas.commitSha }),
]) satisfies z.ZodType<VerifyReading>;
