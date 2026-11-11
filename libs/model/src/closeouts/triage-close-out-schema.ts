import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { frictionSchema } from './friction-schema.ts';
import type { TriageCloseOut } from './types.ts';

const acceptedSchema = z.object({ kind: z.literal('accepted') });
const duplicateSchema = z.object({ kind: z.literal('duplicate'), of: brandSchemas.itemId });
const declinedSchema = z.object({ kind: z.literal('declined'), reason: z.string().min(1) });
const designModeSchema = z.enum(['agent', 'attended']);
const criterionTextSchema = z.object({ text: z.string().min(1) });

const setSchema = z.strictObject({
  kind: brandSchemas.itemKindName.exactOptional(),
  designMode: designModeSchema.exactOptional(),
  acceptance: z.array(criterionTextSchema).exactOptional(),
});

const relationDraftSchema = z.object({
  type: brandSchemas.relationTypeName,
  target: brandSchemas.itemId,
});

export const triageCloseOutSchema = z.strictObject({
  result: z.discriminatedUnion('kind', [acceptedSchema, duplicateSchema, declinedSchema]),
  set: setSchema.exactOptional(),
  relations: z.array(relationDraftSchema),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
}) satisfies z.ZodType<TriageCloseOut>;
