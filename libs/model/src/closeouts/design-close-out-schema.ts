import { z } from 'zod';
import { frictionSchema } from './friction-schema.ts';
import type { DesignCloseOut } from './types.ts';

const reasonSchema = z.string().min(1);

const designRefSchema = z.object({
  summary: z.string().min(1),
  location: z.string().min(1).nullable(),
});

const designedSchema = z.object({ kind: z.literal('designed'), design: designRefSchema });
const blockedSchema = z.object({ kind: z.literal('blocked'), reason: reasonSchema });
const abandonedSchema = z.object({ kind: z.literal('abandoned'), reason: reasonSchema });

export const designCloseOutSchema: z.ZodType<DesignCloseOut> = z.strictObject({
  result: z.discriminatedUnion('kind', [designedSchema, blockedSchema, abandonedSchema]),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
});
