import { z } from 'zod';
import type { RunnerRow } from '../types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

export const runnerRowSchema: z.ZodType<RunnerRow> = z.object({
  id: brandSchemas.runnerId,
  heartbeatAt: brandSchemas.instant,
  paused: z.boolean(),
  pausedAt: brandSchemas.instant.nullable(),
  pausedBy: actorRefSchema.nullable(),
  pauseReason: z.string().nullable(),
  pauseNoticedAt: brandSchemas.instant.nullable(),
});
