import { z } from 'zod';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { LoadRejection, LoadRejectionReason } from './types.ts';

const phase = brandSchemas.phaseName;
const outcomeOfPhase = { phase, outcome: z.string() };

const loadRejectionReasonSchema: z.ZodType<LoadRejectionReason> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invalid'), message: z.string() }),
  z.object({ kind: z.literal('unknown-concept'), ref: z.string() }),
  z.object({ kind: z.literal('unknown-signal'), signal: z.string() }),
  z.object({
    kind: z.literal('bad-plugin-params'),
    pluginKind: z.enum(['signal', 'gate', 'admission']),
    name: z.string(),
    message: z.string(),
  }),
  z.object({ kind: z.literal('unknown-relation-type'), relation: z.string() }),
  z.object({ kind: z.literal('signal-without-combine'), signal: z.string() }),
  z.object({ kind: z.literal('missing-recipe'), itemKind: z.string(), phase: z.string() }),
  z.object({ kind: z.literal('missing-prompt'), path: z.string() }),
  z.object({ kind: z.literal('bad-prompt'), path: z.string(), message: z.string() }),
  z.object({ kind: z.literal('uncommitted-changes') }),
  z.object({ kind: z.literal('unknown-filter-field'), field: z.string() }),
  z.object({ kind: z.literal('pool-without-limit'), pool: z.string() }),
  z.object({ kind: z.literal('unknown-phase'), phase: z.string() }),
  z.object({ kind: z.literal('unmapped-outcome'), ...outcomeOfPhase }),
  z.object({ kind: z.literal('unknown-outcome'), ...outcomeOfPhase }),
  z.object({ kind: z.literal('open-loop'), ...outcomeOfPhase }),
  z.object({ kind: z.literal('edge-to-unknown-phase'), phase, to: z.string() }),
  z.object({
    kind: z.literal('step-without-recipe'),
    itemKind: brandSchemas.itemKindName,
    phase,
  }),
  z.object({ kind: z.literal('step-without-timeout'), phase }),
  z.object({ kind: z.literal('quiet-below-idle') }),
  z.object({ kind: z.literal('unattended-below-quiet') }),
  z.object({
    kind: z.literal('engine-outcome-listed'),
    phase,
    outcome: z.enum(['lost', 'unsettleable']),
  }),
  z.object({ kind: z.literal('skills-without-pin'), recipe: z.string() }),
  z.object({ kind: z.literal('resume-on-forward-edge'), ...outcomeOfPhase }),
  z.object({ kind: z.literal('engine-hold-reason'), ...outcomeOfPhase, reason: z.string() }),
  z.object({ kind: z.literal('unknown-worker'), phase, worker: brandSchemas.workerKindName }),
  z.object({ kind: z.literal('merge-without-rules') }),
  z.object({ kind: z.literal('empty-merge-checks') }),
  z.object({ kind: z.literal('builder-session-not-kept'), recipe: z.string() }),
]);

export const loadRejectionSchema: z.ZodType<LoadRejection> = z.object({
  file: z.string(),
  path: z.string(),
  reason: loadRejectionReasonSchema,
});
