import { z } from 'zod';
import type { ItemFields } from '../types.ts';

// The typed fields of an item, as its row, its `filed` fact and its `edited` fact hold them.
export const itemFieldsSchema = z.object({
  designMode: z.enum(['agent', 'attended']).exactOptional(),
  security: z.literal(true).exactOptional(),
}) satisfies z.ZodType<ItemFields>;
