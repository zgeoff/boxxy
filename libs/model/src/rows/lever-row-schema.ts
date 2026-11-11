import { z } from 'zod';
import type { LeverRow } from '../types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

// A plain object, so that the wire schema of `boxxy.lever.recorded` can extend it.
export const leverRowSchema = z.object({
  seq: z.number().int().nonnegative(),
  kind: z.templateLiteral([z.string().min(1), '.', z.string().min(1)]),
  item: brandSchemas.itemId,
  until: brandSchemas.instant.nullable(),
  expiresAt: brandSchemas.instant.nullable(),
  reason: z.string().nullable(),
  phase: brandSchemas.phaseName.nullable(),
  actor: actorRefSchema,
  at: brandSchemas.instant,
}) satisfies z.ZodType<LeverRow>;
