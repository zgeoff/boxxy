import { z } from 'zod';
import type { Friction } from '../facts/types.ts';

export const frictionSchema: z.ZodType<Friction> = z.object({
  target: z.object({
    kind: z.enum(['skill', 'rule', 'lint', 'agents-md', 'tool']),
    name: z.string().min(1),
  }),
  change: z.string().min(1),
});
