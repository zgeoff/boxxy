import { z } from 'zod';

export const contentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/u)
  .brand<'ContentHash'>();

export type ContentHash = z.output<typeof contentHashSchema>;
