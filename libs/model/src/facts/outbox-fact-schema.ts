import { z } from 'zod';
import { actorRefSchema } from '../rows/actor-ref-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { FactType, OutboxFact } from './types.ts';
import { workFactSchemas } from './work-fact-schemas.ts';

const factTypes = Object.keys(workFactSchemas).filter((type): type is FactType =>
  Object.hasOwn(workFactSchemas, type),
);

export const outboxFactSchema: z.ZodType<OutboxFact> = z.object({
  seq: z.number().int().positive(),
  factId: brandSchemas.factId,
  type: z.enum(factTypes),
  entity: z.templateLiteral(['boxxy:item:', z.string().min(1)]),
  actor: actorRefSchema,
  at: brandSchemas.instant,
  payload: z.json(),
  sentAt: brandSchemas.instant.nullable(),
  parkedAt: brandSchemas.instant.nullable(),
  parkedReason: z.string().min(1).nullable(),
});
