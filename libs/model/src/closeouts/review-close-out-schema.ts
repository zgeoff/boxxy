import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { frictionSchema } from './friction-schema.ts';
import type { ReviewCloseOut } from './types.ts';

const countSchema = z.number().int().nonnegative();

const findingSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  path: z.string().min(1).exactOptional(),
  line: z.number().int().positive().exactOptional(),
});

const passedSchema = z.object({ kind: z.literal('passed') });

const changesRequestedSchema = z.object({
  kind: z.literal('changes-requested'),
  findings: z.array(findingSchema),
});

const noslopSummarySchema = z.object({
  version: z.number().int().positive(),
  reviewID: z.string().min(1),
  head: brandSchemas.commitSha,
  counts: z.object({ findings: countSchema, failedCalls: countSchema, fixChecks: countSchema }),
  reportBytes: countSchema,
  report: z.json().nullable(),
});

// The stored form. The parser of the review phase reads noslop's whole result and builds the
// summary, so this schema never sees the raw result.
export const reviewCloseOutSchema = z.strictObject({
  verdict: z.discriminatedUnion('kind', [passedSchema, changesRequestedSchema]),
  noslop: noslopSummarySchema,
  friction: z.array(frictionSchema),
  frictionDropped: countSchema,
}) satisfies z.ZodType<ReviewCloseOut>;
