import { z } from 'zod';
import type { ItemRevision } from '../items/types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

export const itemRevisionSchema = z.object({
  seq: z.number().int().positive(),
  at: brandSchemas.instant,
  actor: actorRefSchema,
  changed: z.array(z.string()),
}) satisfies z.ZodType<ItemRevision>;
