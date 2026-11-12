import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { ReviewInput } from './types.ts';

// The input of a review attempt as its claim stored it, which the close-out procedure reads back.
export const reviewInputSchema = z.object({
  pullRequest: z
    .object({ repo: brandSchemas.repoName, number: z.number().int().positive() })
    .nullable(),
  round: z.number().int().positive(),
  cause: z.enum(['first', 'rework', 'recheck']),
  command: z.string().min(1).nullable(),
}) satisfies z.ZodType<ReviewInput>;
