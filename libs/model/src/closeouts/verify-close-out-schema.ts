import { z } from 'zod';
import { frictionSchema } from './friction-schema.ts';
import type { VerifyCloseOut } from './types.ts';

const featuresSchema = z.array(z.string().min(1)).min(1);

const resultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('verified') }),
  z.object({ kind: z.literal('failed'), features: featuresSchema }),
  z.object({ kind: z.literal('blocked'), question: z.string().min(1) }),
  z.object({ kind: z.literal('abandoned'), reason: z.string().min(1) }),
]);

export const verifyCloseOutSchema = z.strictObject({
  result: resultSchema,
  session: z.enum(['builder', 'fresh']),
  friction: z.array(frictionSchema),
  frictionDropped: z.number().int().nonnegative(),
}) satisfies z.ZodType<VerifyCloseOut>;
