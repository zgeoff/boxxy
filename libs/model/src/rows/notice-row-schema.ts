import { z } from 'zod';
import type { NoticeRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

const countSchema = z.number().int().nonnegative();

export const noticeRowSchema: z.ZodType<NoticeRow> = z.object({
  id: z.number().int().positive(),
  item: brandSchemas.itemId,
  reason: z.union([
    z.enum(['attempts used up', 'rounds used up', 'outcome not in rules']),
    brandSchemas.rulesHoldReason,
  ]),
  at: brandSchemas.instant,
  tries: countSchema,
  sentAt: brandSchemas.instant.nullable(),
});
