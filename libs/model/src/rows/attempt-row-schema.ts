import { contentHashSchema } from '@boxxy/content-hash';
import { z } from 'zod';
import { closeOutSchema } from '../closeouts/close-out-schema.ts';
import type { AttemptRow } from '../types.ts';
import { brandSchemas } from './brand-schemas.ts';
import { callerIdentitySchema } from './caller-identity-schema.ts';

const countSchema = z.number().int().nonnegative();
const instantOrNullSchema = brandSchemas.instant.nullable();
const fieldValuesSchema = z.record(z.string(), z.array(z.string()));

export const attemptRowSchema: z.ZodType<AttemptRow> = z.object({
  id: brandSchemas.attemptId,
  item: brandSchemas.itemId,
  phase: brandSchemas.phaseName,
  number: z.number().int().positive(),
  runner: brandSchemas.runnerId,
  recipeHash: brandSchemas.recipeHash,
  rulesVersion: brandSchemas.rulesVersion,
  pool: brandSchemas.poolName,
  leaseGen: countSchema,
  spawnRequest: z.json(),
  spawnRequestHash: contentHashSchema,
  state: z.enum([
    'starting',
    'running',
    'reconciling',
    'sleeping',
    'waking',
    'closing',
    'succeeded',
    'failed',
  ]),
  failure: z.string().nullable(),
  atcSession: brandSchemas.atcSessionId.nullable(),
  caller: callerIdentitySchema.nullable(),
  claimedAt: brandSchemas.instant,
  startedAt: instantOrNullSchema,
  endedAt: instantOrNullSchema,
  fields: fieldValuesSchema,
  mode: z.enum(['agent', 'attended']),
  round: z.number().int().positive(),
  input: z.json(),
  holdGen: z.number().int().positive(),
  closeOut: closeOutSchema.nullable(),
  closeOutHash: contentHashSchema.nullable(),
  closeOutFact: brandSchemas.factId.nullable(),
  closing: z
    .enum(['closed-out', 'timed-out', 'item-closed', 'stalled', 'skill-missing', 'turn-ended'])
    .nullable(),
  closingAt: instantOrNullSchema,
  suspendRequestedAt: instantOrNullSchema,
  sleptAt: instantOrNullSchema,
  wakeRequestedAt: instantOrNullSchema,
  wokenAt: instantOrNullSchema,
  outcome: z.union([brandSchemas.outcomeName, z.enum(['lost', 'unsettleable'])]).nullable(),
  returnedOutcome: z.string().nullable(),
  strayedAt: instantOrNullSchema,
  sessionStoppedAt: instantOrNullSchema,
  sessionForgottenAt: instantOrNullSchema,
});
