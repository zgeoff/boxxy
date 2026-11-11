import { z } from 'zod';
import { buildCloseOutSchema } from './build-close-out-schema.ts';
import { designCloseOutSchema } from './design-close-out-schema.ts';
import { reviewCloseOutSchema } from './review-close-out-schema.ts';
import { triageCloseOutSchema } from './triage-close-out-schema.ts';
import type { CloseOut } from './types.ts';

export const closeOutSchema: z.ZodType<CloseOut> = z.union([
  reviewCloseOutSchema,
  triageCloseOutSchema,
  buildCloseOutSchema,
  designCloseOutSchema,
]);
