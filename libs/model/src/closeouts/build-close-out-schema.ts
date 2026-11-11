import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { frictionSchema } from './friction-schema.ts';
import { openItemSchema } from './open-item-schema.ts';
import type { BuildCloseOut } from './types.ts';

const reasonSchema = z.string().min(1);
const builtSchema = z.object({ kind: z.literal('built') });
const blockedSchema = z.object({ kind: z.literal('blocked'), reason: reasonSchema });
const abandonedSchema = z.object({ kind: z.literal('abandoned'), reason: reasonSchema });

const citedEvidenceSchema = z.object({
  criterion: brandSchemas.criterionId,
  evidence: brandSchemas.factId,
});

export const buildCloseOutSchema = z.strictObject({
  result: z.discriminatedUnion('kind', [builtSchema, blockedSchema, abandonedSchema]),
  criteria: z.array(citedEvidenceSchema),
  openItems: z.array(openItemSchema),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
}) satisfies z.ZodType<BuildCloseOut>;
