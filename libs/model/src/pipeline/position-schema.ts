import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { Position } from './types.ts';

const holdReasonSchema = z.union([
  z.literal('attempts used up'),
  z.literal('rounds used up'),
  z.literal('outcome not in rules'),
  brandSchemas.rulesHoldReason,
]);

export const positionSchema: z.ZodType<Position> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('phase'),
    phase: brandSchemas.phaseName,
    round: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('end'), reason: z.string() }),
  z.object({
    kind: z.literal('hold'),
    reason: holdReasonSchema,

    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase that the hold resumes; the object is never awaited
    then: brandSchemas.phaseName,
    round: z.number().int().positive(),
  }),
]);
