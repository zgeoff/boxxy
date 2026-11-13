import { z } from 'zod';
import type { ItemRow } from '../types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';
import { callerIdentitySchema } from './caller-identity-schema.ts';
import { criterionSchema } from './criterion-schema.ts';
import { itemFieldsSchema } from './item-fields-schema.ts';

// A plain object, so that the fact schema of `boxxy.item.filed` can omit `keptSession`.
export const itemRowSchema = z.object({
  id: brandSchemas.itemId,
  kind: brandSchemas.itemKindName,
  repo: brandSchemas.repoName,
  title: z.string().min(1),
  outcome: z.string().min(1),
  body: z.string(),
  acceptance: z.array(criterionSchema),
  fields: itemFieldsSchema,
  labels: z.array(z.string().min(1)),
  foundInAttempt: brandSchemas.attemptId.nullable(),
  filedBy: actorRefSchema,
  filedAt: brandSchemas.instant,
  closedAt: brandSchemas.instant.nullable(),
  closeReason: z.string().nullable(),
  keptSession: z
    .object({
      atcSession: brandSchemas.atcSessionId,
      target: z.string().min(1),
      attempt: brandSchemas.attemptId,
      keptAt: brandSchemas.instant,
      caller: callerIdentitySchema.nullable(),
    })
    .nullable(),
}) satisfies z.ZodType<ItemRow>;
