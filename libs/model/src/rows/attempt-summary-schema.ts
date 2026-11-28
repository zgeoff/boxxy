import { z } from 'zod';
import { brandSchemas } from './brand-schemas.ts';
import { refusalDetailSchema } from './refusal-detail-schema.ts';

const instantOrNullSchema = brandSchemas.instant.nullable();

// An attempt without its launch prompt, its input, its close-out body and its field values: the
// short scalars that show an item's history. The schema refuses any other key, so a summary that
// carries one fails to parse. `outcome` is the name the close-out chose, null without a close-out. Callers read the full row from `attempt.get`.
export const attemptSummarySchema = z.strictObject({
  id: brandSchemas.attemptId,
  item: brandSchemas.itemId,
  phase: brandSchemas.phaseName,
  number: z.number().int().positive(),
  round: z.number().int().positive(),
  mode: z.enum(['agent', 'attended']),
  state: z.enum([
    'starting',
    'running',
    'reconciling',
    'sleeping',
    'waking',
    'closing',
    'succeeded',
    'failed',
  ]),
  failure: z.string().nullable(),
  refusal: refusalDetailSchema.nullable(),
  pool: brandSchemas.poolName.nullable(),
  runner: brandSchemas.runnerId,
  atcSession: brandSchemas.atcSessionId.nullable(),
  claimedAt: brandSchemas.instant,
  startedAt: instantOrNullSchema,
  endedAt: instantOrNullSchema,
  outcome: brandSchemas.outcomeName.nullable(),
});

export type AttemptSummary = z.infer<typeof attemptSummarySchema>;
