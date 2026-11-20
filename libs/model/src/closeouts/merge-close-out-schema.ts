import { z } from 'zod';
import { verifyReadingSchema } from '../merge/verify-reading-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { MergeCloseOut } from './types.ts';

const checkNamesSchema = z.array(z.string().min(1));

const signoffSchema = z.strictObject({
  rules: z.array(z.string().min(1)),
  paths: z.array(z.string().min(1)).max(50),
  truncated: z.boolean(),
});

const sentBackSchema = z.strictObject({
  head: brandSchemas.commitSha,
  findings: z.string().min(1),
});

export const mergeCloseOutSchema = z.strictObject({
  outcome: z.enum([
    'merged',
    'repair',
    'stale',
    'closed',
    'stalled',
    'refused',
    'blocked',
    'needs-signoff',
    'changes-requested',
  ]),
  head: brandSchemas.commitSha.nullable(),
  required: checkNamesSchema,
  failed: checkNamesSchema,
  cause: z.enum(['conflict', 'checks-red']).nullable(),
  mergeCommit: brandSchemas.commitSha.nullable(),
  reason: z.string().min(1).nullable(),
  byBoxxy: z.boolean(),
  verify: verifyReadingSchema.nullable(),

  // a close-out stored before the sign-off rule has neither
  signoff: signoffSchema.nullable().default(null),
  sentBack: sentBackSchema.nullable().default(null),
}) satisfies z.ZodType<MergeCloseOut>;
