import { z } from 'zod';
import type { WaitNoticeMark } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';

export const waitNoticeMarkRowSchema: z.ZodType<WaitNoticeMark> = z.object({
  itemId: brandSchemas.itemId,
  since: brandSchemas.instant,
  noticedAt: brandSchemas.instant,
});
