import { z } from 'zod';
import type { NoticeRow } from '../types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

const countSchema = z.number().int().nonnegative();

const baseShape = {
  id: z.number().int().positive(),
  at: brandSchemas.instant,
  tries: countSchema,
  sentAt: brandSchemas.instant.nullable(),
  keySeq: countSchema,
  keyTries: countSchema,
  nextTryAt: brandSchemas.instant,
};

const holdNoticeSchema = z.object({
  ...baseShape,
  kind: z.literal('hold'),
  item: brandSchemas.itemId,
  reason: z.union([
    z.enum(['attempts used up', 'rounds used up', 'outcome not in rules']),
    brandSchemas.rulesHoldReason,
  ]),
  pause: z.null(),
});

const pausedNoticeSchema = z.object({
  ...baseShape,
  kind: z.literal('runner-paused'),
  item: z.null(),
  reason: z.null(),
  pause: z.object({
    pausedAt: brandSchemas.instant,
    pausedBy: actorRefSchema,
    reason: z.string().nullable(),
    waiting: countSchema,
  }),
});

export const noticeRowSchema: z.ZodType<NoticeRow> = z.discriminatedUnion('kind', [
  holdNoticeSchema,
  pausedNoticeSchema,
]);
