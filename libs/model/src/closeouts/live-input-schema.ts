import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { itemShippedFactSchema } from '../rows/item-shipped-fact-schema.ts';
import type { LiveInput } from './types.ts';

const criterionTextSchema = z.object({
  id: brandSchemas.criterionId,
  text: z.string().min(1),
  tags: z.array(z.string().min(1)).exactOptional(),
});

// The input of a live attempt as its claim stored it, which the live parser reads back.
export const liveInputSchema = z.object({
  pullRequest: z
    .object({
      repo: brandSchemas.repoName,
      number: z.number().int().positive(),
      url: z.string().min(1),
    })
    .nullable(),
  commit: brandSchemas.commitSha.nullable(),
  shipped: itemShippedFactSchema.nullable(),
  criteria: z.array(criterionTextSchema),
}) satisfies z.ZodType<LiveInput>;
