import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { CloseOutAnswer, CloseOutProblem } from './types.ts';

const closeOutProblemSchema: z.ZodType<CloseOutProblem> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('schema'), path: z.string(), message: z.string() }),
  z.object({ kind: z.literal('unknown-criterion'), criterion: brandSchemas.criterionId }),
  z.object({ kind: z.literal('foreign-evidence'), evidence: brandSchemas.factId }),
  z.object({
    kind: z.literal('built-without-evidence'),
    criteria: z.array(brandSchemas.criterionId),
  }),
  z.object({ kind: z.literal('no-acceptance') }),
  z.object({ kind: z.literal('unknown-item'), item: z.string() }),
  z.object({ kind: z.literal('unknown-kind'), itemKind: z.string() }),
  z.object({
    kind: z.literal('refused-relation'),
    type: z.string(),
    target: z.string(),
    reason: z.enum(['unknown-type', 'self']),
  }),
  z.object({ kind: z.literal('phase-rule'), message: z.string() }),
  z.object({
    kind: z.literal('too-large'),
    bytes: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
]);

export const closeOutAnswerSchema: z.ZodType<CloseOutAnswer> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('recorded'),
    attempt: brandSchemas.attemptId,
    factId: brandSchemas.factId,
    repeat: z.boolean(),
  }),
  z.object({ kind: z.literal('rejected'), problems: z.array(closeOutProblemSchema) }),
  z.object({
    kind: z.literal('refused'),
    reason: z.enum(['no-attempt', 'already-closed-out', 'not-current']),
  }),
]);
