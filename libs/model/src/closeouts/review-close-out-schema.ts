import { z } from 'zod';
import type { GateReading } from '../ports/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { ReviewCloseOut } from './types.ts';

const countSchema = z.number().int().nonnegative();

const callSchema = z.object({
  model: z.string().min(1),
  input: countSchema,
  cachedInput: countSchema,
  cacheWrite: countSchema,
  output: countSchema,
  durationMs: countSchema,
});

const costSchema = z.object({ calls: z.array(callSchema) });

const runShape = {
  head: brandSchemas.commitSha,
  open: z.object({ high: countSchema, medium: countSchema, low: countSchema }),
  closedWithoutFix: countSchema,
  findingPaths: z.array(z.string().min(1)),
  cost: costSchema,
  ref: z.string().min(1),
  answerHint: z.string(),
};

export const gateReadingSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('passed'), ...runShape }),
  z.object({
    status: z.literal('blocked'),
    why: z.enum(['open-findings', 'failed-call', 'unreadable']),
    ...runShape,
  }),
  z.object({ status: z.literal('not-covered'), head: brandSchemas.commitSha, cost: costSchema }),
]) satisfies z.ZodType<GateReading>;

// The stored form, which the server builds from the session's raw result with the review gate.
export const reviewCloseOutSchema = z.strictObject({
  round: z.number().int().positive(),
  cause: z.enum(['first', 'rework', 'recheck']),
  reading: gateReadingSchema,
  unrelatedLines: countSchema.nullable(),
}) satisfies z.ZodType<ReviewCloseOut>;
