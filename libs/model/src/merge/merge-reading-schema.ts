import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { mergeObservationSchema } from './merge-observation-schema.ts';
import type { MergeReading } from './types.ts';

const pullRequestRefSchema = z.object({
  repo: brandSchemas.repoName,
  number: z.number().int().positive(),
});

// The JSON form of what the merge job read, as the merge phase kind reads it back: an observation,
// or the reason no read can give one.
export const mergeReadingSchema = z.union([
  z.strictObject({ state: z.literal('unreadable'), problem: z.literal('no-pull-request') }),
  z.strictObject({
    state: z.literal('unreadable'),
    problem: z.enum(['pull-request-not-found', 'no-commit']),
    pullRequest: pullRequestRefSchema,
  }),
  mergeObservationSchema,
]) satisfies z.ZodType<MergeReading>;
