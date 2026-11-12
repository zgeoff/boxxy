import type { JsonValue } from '@boxxy/content-hash';
import { z } from 'zod';
import type { Design, Finding } from './types.ts';

const designSchema = z.object({ text: z.string(), location: z.string().nullable() });

const findingSchema = z.object({
  title: z.string(),
  body: z.string(),
  path: z.string().exactOptional(),
  line: z.number().exactOptional(),
});

const launchInputSchema = z.object({
  design: designSchema.nullable().optional(),
  findings: z.array(findingSchema).optional(),
});

export interface LaunchSections {
  readonly design: Design | null;
  readonly findings: readonly Finding[];
}

// The design and the findings that a phase input carries into the launch prompt. A triage or a
// design input holds neither, and gives none.
export function getLaunchSections(input: JsonValue): LaunchSections {
  const parsed = launchInputSchema.safeParse(input);

  return {
    design: parsed.success ? (parsed.data.design ?? null) : null,
    findings: parsed.success ? (parsed.data.findings ?? []) : [],
  };
}
