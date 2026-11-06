import { z } from 'zod';
import { brandSchemas } from './brand-schemas.ts';
import { frictionSchema } from './friction-schema.ts';
import type { BuildCloseOut } from './types/facts.ts';

const reasonSchema = z.string().min(1);
const builtSchema = z.object({ kind: z.literal('built') });
const blockedSchema = z.object({ kind: z.literal('blocked'), reason: reasonSchema });
const abandonedSchema = z.object({ kind: z.literal('abandoned'), reason: reasonSchema });

const citedEvidenceSchema = z.object({
  criterion: brandSchemas.criterionId,
  evidence: brandSchemas.factId,
});

const openItemSchema = z.object({
  kind: z.literal('core.issue'),
  title: z.string().min(1),
  body: z.string(),
});

export const buildCloseOutSchema: z.ZodType<BuildCloseOut> = z.object({
  result: z.discriminatedUnion('kind', [builtSchema, blockedSchema, abandonedSchema]),
  criteria: z.array(citedEvidenceSchema),
  openItems: z.array(openItemSchema),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
});
