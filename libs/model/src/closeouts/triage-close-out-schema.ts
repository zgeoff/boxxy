import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { itemBodyMaxChars } from '../rows/item-body-max-chars.ts';
import { acceptanceDraftSchema } from './acceptance-draft-schema.ts';
import { frictionSchema } from './friction-schema.ts';
import { openItemSchema } from './open-item-schema.ts';
import type { TriageCloseOut } from './types.ts';

// Strict, so a session that sends a field of one result with another hears of it instead of
// losing it, such as `openItems` with `declined`.
const acceptedSchema = z.strictObject({ kind: z.literal('accepted') });
const duplicateSchema = z.strictObject({ kind: z.literal('duplicate'), of: brandSchemas.itemId });
const declinedSchema = z.strictObject({ kind: z.literal('declined'), reason: z.string().min(1) });

const needsOwnerSchema = z.strictObject({
  kind: z.literal('needs-owner'),
  question: z.string().min(1),
});

const splitSchema = z.strictObject({
  kind: z.literal('split'),
  openItems: z.array(openItemSchema).min(1),
});

const designModeSchema = z.enum(['agent', 'attended']);

const setSchema = z.strictObject({
  kind: brandSchemas.itemKindName.exactOptional(),
  designMode: designModeSchema.exactOptional(),
  acceptance: acceptanceDraftSchema.exactOptional(),
  body: z.string().max(itemBodyMaxChars).exactOptional(),
});

// Strict, so a draft that names both ends is refused instead of read as one of them.
const relationDraftSchema = z.union([
  z.strictObject({ type: brandSchemas.relationTypeName, target: brandSchemas.itemId }),
  z.strictObject({ type: brandSchemas.relationTypeName, source: brandSchemas.itemId }),
]);

export const triageCloseOutSchema = z.strictObject({
  result: z.discriminatedUnion('kind', [
    acceptedSchema,
    duplicateSchema,
    declinedSchema,
    needsOwnerSchema,
    splitSchema,
  ]),
  set: setSchema.exactOptional(),
  relations: z.array(relationDraftSchema),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
}) satisfies z.ZodType<TriageCloseOut>;
