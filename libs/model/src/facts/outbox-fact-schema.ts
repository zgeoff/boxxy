import { z } from 'zod';
import { actorRefSchema } from '../rows/actor-ref-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { OutboxFact } from './types.ts';

const idSchema = z.string();

const entityRefSchema = z.union([
  z.templateLiteral(['boxxy:item:', idSchema]),
  z.templateLiteral(['boxxy:link:', idSchema, ':', idSchema, ':', idSchema]),
  z.templateLiteral(['boxxy:attempt:', idSchema]),
  z.templateLiteral(['boxxy:decision:', idSchema]),
  z.templateLiteral(['boxxy:runner:', idSchema]),
]);

export const outboxFactSchema: z.ZodType<OutboxFact> = z.object({
  seq: z.number().int().positive(),
  factId: brandSchemas.factId,
  type: z.string().min(1),
  entity: entityRefSchema,
  actor: actorRefSchema,
  at: brandSchemas.instant,
  payload: z.json(),
  sentAt: brandSchemas.instant.nullable(),
});
