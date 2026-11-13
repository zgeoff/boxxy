import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { MergeInput } from './types.ts';

// The input of a merge attempt as its claim stored it, which the merge job reads back.
export const mergeInputSchema = z.object({
  pullRequest: z
    .object({
      repo: brandSchemas.repoName,
      number: z.number().int().positive(),
      url: z.string().min(1),
    })
    .nullable(),
}) satisfies z.ZodType<MergeInput>;
