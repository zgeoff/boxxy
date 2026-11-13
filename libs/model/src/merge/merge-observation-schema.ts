import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { CheckState, MergeObservation } from './types.ts';
import { verifyReadingSchema } from './verify-reading-schema.ts';

const checkStateSchema = z.enum(['success', 'failure', 'pending', 'other']);

// A job's reading travels as JSON, which holds no Map, so the checks travel as an object.
const checksSchema = z
  .record(z.string().min(1), checkStateSchema)
  .transform((record): ReadonlyMap<string, CheckState> => new Map(Object.entries(record)));

// The JSON form of an observation, as the merge phase kind reads it back from a job's reading.
export const mergeObservationSchema = z.object({
  pullRequest: z.object({ repo: brandSchemas.repoName, number: z.number().int().positive() }),
  state: z.enum(['open', 'closed', 'merged']),
  head: brandSchemas.commitSha,
  mergeable: z.enum(['clean', 'conflict', 'unknown']),
  checks: checksSchema,
  baseRequired: z.array(z.string().min(1)),
  mergeCommit: brandSchemas.commitSha.nullable(),
  review: z
    .object({
      head: brandSchemas.commitSha,
      status: z.enum(['passed', 'blocked', 'not-covered']),
      attempt: brandSchemas.attemptId,
    })
    .nullable(),
  verify: verifyReadingSchema,
}) satisfies z.ZodType<MergeObservation>;
