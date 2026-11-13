import { z } from 'zod';
import { positionSchema } from '../pipeline/position-schema.ts';
import type { ItemListView, ItemView, SessionItemListView, SessionItemView } from '../types.ts';
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
  z.object({ state: z.literal('held'), reason: z.string() }),
]);

// typed as the core type, so a handler returns the stored view with its read-only lists
const itemViewObjectSchema = itemRowSchema.extend({
  derived: derivedSchema,
  position: positionSchema,
});

export const itemViewSchema: z.ZodType<ItemView> = itemViewObjectSchema;

// A row of `item.list` leaves out the body, which can be long.
export const itemListViewSchema: z.ZodType<ItemListView> = itemViewObjectSchema.omit({
  body: true,
});

// A worker session's views leave out the kept session, which names another session.
export const sessionItemViewSchema: z.ZodType<SessionItemView> = itemViewObjectSchema.omit({
  keptSession: true,
});

export const sessionItemListViewSchema: z.ZodType<SessionItemListView> = itemViewObjectSchema.omit({
  keptSession: true,
  body: true,
});
