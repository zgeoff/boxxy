import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { RelationDraft } from './types.ts';

// Strict, so a draft that names both ends is refused instead of read as one of them.
export const relationDraftSchema = z.union([
  z.strictObject({ type: brandSchemas.relationTypeName, target: brandSchemas.itemId }),
  z.strictObject({ type: brandSchemas.relationTypeName, source: brandSchemas.itemId }),
]) satisfies z.ZodType<RelationDraft>;
