import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { OpenItem } from './types.ts';

export const openItemSchema = z.object({
  kind: brandSchemas.itemKindName,
  title: z.string().min(1),
  body: z.string(),
  security: z.boolean().exactOptional(),
}) satisfies z.ZodType<OpenItem>;
