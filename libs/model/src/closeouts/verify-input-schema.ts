import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { VerifyInput } from './types.ts';

// The input of a verify attempt as its claim stored it, which the verify parser reads back.
export const verifyInputSchema = z.object({
  pullRequest: z
    .object({
      repo: brandSchemas.repoName,
      number: z.number().int().positive(),
      url: z.string().min(1),
    })
    .nullable(),
  head: brandSchemas.commitSha.nullable(),
  session: z.enum(['builder', 'fresh']),
}) satisfies z.ZodType<VerifyInput>;
