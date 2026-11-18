import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { acceptanceDraftSchema } from './acceptance-draft-schema.ts';
import { openItemSchema } from './open-item-schema.ts';
import type { LiveCloseOut } from './types.ts';

const lineResultSchema = z.object({
  criterionId: brandSchemas.criterionId,
  passed: z.boolean(),
  evidence: z.string().min(1),
});

// the failing lines of the bug, which the filed item keeps with their tags
const liveBugSchema = openItemSchema.extend({
  acceptance: acceptanceDraftSchema.refine((lines) => lines.length > 0, {
    message: 'a bug carries at least one failing line',
  }),
});

// Strict, so a `blocked` close-out that sends a `bug` hears of it instead of losing it.
export const liveCloseOutSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('confirmed'), lines: z.array(lineResultSchema) }),
  z.strictObject({
    outcome: z.literal('broken'),
    lines: z.array(lineResultSchema),
    bug: liveBugSchema,
  }),
  z.strictObject({ outcome: z.literal('blocked'), reason: z.string().min(1) }),
  z.strictObject({ outcome: z.literal('abandoned'), reason: z.string().min(1) }),
]) satisfies z.ZodType<LiveCloseOut>;
