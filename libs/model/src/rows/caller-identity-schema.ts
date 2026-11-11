import { z } from 'zod';
import type { CallerIdentity } from '../types.ts';

export const callerIdentitySchema: z.ZodType<CallerIdentity> = z.object({
  issuer: z.string().min(1),
  subject: z.string().min(1),
});
