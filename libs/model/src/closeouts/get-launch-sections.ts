import type { JsonValue } from '@boxxy/content-hash';
import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { Design, SentBack } from './types.ts';

const designSchema = z.object({ text: z.string(), location: z.string().nullable() });
const countSchema = z.number().int().nonnegative();

const reviewSentBackSchema = z.object({
  from: z.literal('review'),
  head: brandSchemas.commitSha,
  open: z.object({ high: countSchema, medium: countSchema, low: countSchema }),
  answerHint: z.string(),
});

const verifySentBackSchema = z.object({
  from: z.literal('verify'),
  head: brandSchemas.commitSha.nullable(),
  features: z.array(z.string().min(1)).min(1),
});

const sentBackSchema = z.discriminatedUnion('from', [
  reviewSentBackSchema,
  verifySentBackSchema,
]) satisfies z.ZodType<SentBack>;

const launchInputSchema = z.object({
  design: designSchema.nullable().optional(),
  conclusion: z.string().nullable().optional(),
  sentBack: sentBackSchema.nullable().optional(),
  stopped: z.string().nullable().optional(),
});

export interface LaunchSections {
  readonly design: Design | null;
  readonly conclusion: string | null;
  readonly sentBack: SentBack | null;
  readonly stopped: string | null;
}

// The design, its conclusion, the send-back and where the last attempt of the phase stopped, that a phase input
// carries into the launch prompt. A build input holds all four, and a triage or a design input
// only the last.
export function getLaunchSections(input: JsonValue): LaunchSections {
  const parsed = launchInputSchema.safeParse(input);

  return {
    design: parsed.success ? (parsed.data.design ?? null) : null,
    conclusion: parsed.success ? (parsed.data.conclusion ?? null) : null,
    sentBack: parsed.success ? (parsed.data.sentBack ?? null) : null,
    stopped: parsed.success ? (parsed.data.stopped ?? null) : null,
  };
}
