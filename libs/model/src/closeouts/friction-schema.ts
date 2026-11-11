import { z } from 'zod';
import type { Friction } from './types.ts';

// A plain object, so that the fact schema of `boxxy.proposal.recorded` can extend it.
export const frictionSchema = z.object({
  target: z.object({
    kind: z.enum(['skill', 'rule', 'lint', 'agents-md', 'tool']),
    name: z.string().min(1),
  }),
  change: z.string().min(1),
}) satisfies z.ZodType<Friction>;
