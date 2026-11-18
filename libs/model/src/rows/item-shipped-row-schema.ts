import { z } from 'zod';
import type { ItemShipped } from '../types.ts';
import { itemShippedFactSchema } from './item-shipped-fact-schema.ts';

// The stored row has no column value for an absent `release`, which reads back as null.
export const itemShippedRowSchema: z.ZodType<ItemShipped> = itemShippedFactSchema
  .extend({ release: z.string().min(1).nullable() })
  .transform((row): ItemShipped => {
    const { release, ...rest } = row;

    return release === null ? rest : { ...rest, release };
  });
