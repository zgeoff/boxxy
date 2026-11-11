import { z } from 'zod';
import type { OpenItem } from './types.ts';

export const openItemSchema: z.ZodType<OpenItem> = z.object({
  kind: z.literal('core.issue'),
  title: z.string().min(1),
  body: z.string(),
});
