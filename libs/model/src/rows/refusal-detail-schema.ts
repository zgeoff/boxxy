import { z } from 'zod';
import type { RefusalDetail } from '../types.ts';

// The most characters of atc's message that boxxy keeps.
export const refusalMessageMaxChars = 500;

export const refusalDetailSchema: z.ZodType<RefusalDetail> = z.object({
  code: z.string().min(1),
  problem: z.string().min(1).nullable(),
  message: z.string().max(refusalMessageMaxChars),
});
