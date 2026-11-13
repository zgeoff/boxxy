import { z } from 'zod';
import { verifyReadingSchema } from '../merge/verify-reading-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { MergeCloseOut } from './types.ts';

const checkNamesSchema = z.array(z.string().min(1));

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
