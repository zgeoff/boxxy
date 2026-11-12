import type { JsonValue } from '@boxxy/content-hash';
import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { Design, SentBack } from './types.ts';

const designSchema = z.object({ text: z.string(), location: z.string().nullable() });
const countSchema = z.number().int().nonnegative();

const sentBackSchema = z.object({
  from: z.literal('review'),
  head: brandSchemas.commitSha,
  open: z.object({ high: countSchema, medium: countSchema, low: countSchema }),
  answerHint: z.string(),
});

const launchInputSchema = z.object({
  design: designSchema.nullable().optional(),
  sentBack: sentBackSchema.nullable().optional(),
});

export interface LaunchSections {
  readonly design: Design | null;
  readonly sentBack: SentBack | null;
}

// The design and the send-back that a phase input carries into the launch prompt. A triage or a
// design input holds neither, and gives none.
export function getLaunchSections(input: JsonValue): LaunchSections {
  const parsed = launchInputSchema.safeParse(input);

  return {
    design: parsed.success ? (parsed.data.design ?? null) : null,
    sentBack: parsed.success ? (parsed.data.sentBack ?? null) : null,
  };
}
