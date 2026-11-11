import { z } from 'zod';
import type { NoteRow } from '../types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

export const noteRowSchema: z.ZodType<NoteRow> = z.object({
  item: brandSchemas.itemId,
  seq: z.number().int().positive(),
  text: z.string().min(1),
  by: actorRefSchema,
  at: brandSchemas.instant,
});
