import { z } from 'zod';
import type { VerifyReading } from '../ports/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { MergeCloseOut } from './types.ts';

const checkNamesSchema = z.array(z.string().min(1));

const featureSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['verified', 'stale', 'missing', 'unchanged']),
});

const verifyReadingSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.enum(['verified', 'incomplete']),
    head: brandSchemas.commitSha,
    features: z.array(featureSchema),
  }),
  z.object({ status: z.literal('not-covered'), head: brandSchemas.commitSha }),
]) satisfies z.ZodType<VerifyReading>;

export const mergeCloseOutSchema = z.strictObject({
  outcome: z.enum(['merged', 'repair', 'stale', 'unverified', 'closed', 'stalled', 'refused']),
  head: brandSchemas.commitSha,
  required: checkNamesSchema,
  failed: checkNamesSchema,
  cause: z.enum(['conflict', 'checks-red']).nullable(),
  mergeCommit: brandSchemas.commitSha.nullable(),
  reason: z.string().min(1).nullable(),
  byBoxxy: z.boolean(),
  verify: verifyReadingSchema,
}) satisfies z.ZodType<MergeCloseOut>;
