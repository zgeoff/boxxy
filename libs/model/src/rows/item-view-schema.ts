import { z } from 'zod';
import { positionSchema } from '../pipeline/position-schema.ts';
import type { ItemView } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';
import { itemRowSchema } from './item-row-schema.ts';

const holdReasonOrWaitingSchema = z.union([
  z.literal('pull request open'),
  z.literal('no pull request linked'),
  z.literal('pull request closed unmerged'),
  z.literal('attempts used up'),
  z.literal('rounds used up'),
  z.literal('outcome not in rules'),
  brandSchemas.rulesHoldReason,
]);

const derivedSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idea') }),
  z.object({ state: z.literal('ready') }),
  z.object({ state: z.literal('running') }),
  z.object({ state: z.literal('blocked') }),
  z.object({ state: z.literal('done') }),
  z.object({ state: z.literal('archived') }),
  z.object({ state: z.literal('waiting'), reason: holdReasonOrWaitingSchema }),
]);

// typed as the core type, so a handler returns the stored view with its read-only lists
export const itemViewSchema: z.ZodType<ItemView> = itemRowSchema.extend({
  derived: derivedSchema,
  position: positionSchema,
});
