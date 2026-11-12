import { z } from 'zod';
import type { DecisionRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

const countSchema = z.number().int().nonnegative();

const faultSchema = z.object({
  plugin: z.string().min(1),
  kind: z.enum(['signal', 'gate', 'waiver', 'admission', 'propagation', 'filter-field']),
  item: brandSchemas.itemId.nullable(),
  error: z.string(),
});

const limitCountSchema = z.object({
  limit: brandSchemas.limitName,
  held: countSchema,
  max: countSchema,
});

// A plain object, so that the schema of `boxxy.decision.recorded` can rename one field of it.
export const decisionRowSchema = z.object({
  id: brandSchemas.decisionId,
  attempt: brandSchemas.attemptId,
  item: brandSchemas.itemId,
  kind: z.enum(['start', 'wake']),
  pool: brandSchemas.poolName,
  rulesVersion: brandSchemas.rulesVersion,
  snapshotHash: brandSchemas.snapshotHash,
  storeVersion: countSchema,
  pepysOffsets: z.record(brandSchemas.streamName, countSchema),
  faults: z.array(faultSchema),
  limits: z.array(limitCountSchema),
  at: brandSchemas.instant,
}) satisfies z.ZodType<DecisionRow>;
