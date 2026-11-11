import { z } from 'zod';
import type { RelationRow } from '../types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

export const relationRowSchema: z.ZodType<RelationRow> = z.object({
  source: brandSchemas.itemId,
  target: brandSchemas.itemId,
  type: brandSchemas.relationTypeName,
  addedBy: actorRefSchema,
  addedAt: brandSchemas.instant,
  removedAt: brandSchemas.instant.nullable(),
});
