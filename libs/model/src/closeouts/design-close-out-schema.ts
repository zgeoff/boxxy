import { z } from 'zod';
import { acceptanceDraftSchema } from './acceptance-draft-schema.ts';
import { frictionSchema } from './friction-schema.ts';
import { openItemSchema } from './open-item-schema.ts';
import { relationDraftSchema } from './relation-draft-schema.ts';
import type { DesignCloseOut } from './types.ts';

const reasonSchema = z.string().min(1);

const designSchema = z.preprocess(
  upgradeLegacyDesign,
  z.object({
    text: z.string().min(1),
    location: z.string().min(1).nullable(),
  }),
);

// Strict, so a session that sends `set` or `openItems` with a blocked or abandoned design hears
// of it instead of losing them.
const designedSchema = z.strictObject({
  kind: z.literal('designed'),
  design: designSchema,
  conclusion: z.string().min(1).exactOptional(),
  set: z.strictObject({ acceptance: acceptanceDraftSchema.exactOptional() }).exactOptional(),
  openItems: z.array(openItemSchema).exactOptional(),
  relations: z.array(relationDraftSchema).exactOptional(),
});

const blockedSchema = z.strictObject({
  kind: z.literal('blocked'),
  reason: reasonSchema,
  relations: z.array(relationDraftSchema).exactOptional(),
});

const abandonedSchema = z.strictObject({ kind: z.literal('abandoned'), reason: reasonSchema });

export const designCloseOutSchema = z.strictObject({
  result: z.discriminatedUnion('kind', [designedSchema, blockedSchema, abandonedSchema]),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
}) satisfies z.ZodType<DesignCloseOut>;

const recordSchema = z.record(z.string(), z.unknown());

// A design close-out stored before the design held its whole text has `summary` in place of
// `text`. It reads as `text`, with no change to the stored data.
function upgradeLegacyDesign(value: unknown): unknown {
  const record = recordSchema.safeParse(value);

  if (!record.success || 'text' in record.data || typeof record.data['summary'] !== 'string') {
    return value;
  }

  const { summary, ...rest } = record.data;

  return { ...rest, text: summary };
}
