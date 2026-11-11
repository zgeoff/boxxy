import { contentHashSchema } from '@boxxy/content-hash';
import { z } from 'zod';
import { buildCloseOutSchema } from '../closeouts/build-close-out-schema.ts';
import { factSchemas } from '../facts/fact-schemas.ts';
import type { TableName, Tables } from '../ports/types.ts';
import { actorRefSchema } from './actor-ref-schema.ts';
import { brandSchemas } from './brand-schemas.ts';

const countSchema = z.number().int().nonnegative();

export const rowSchemas: { readonly [T in TableName]: z.ZodType<Tables[T]> } = {
  items: factSchemas['boxxy.item.filed'],
  links: z.object({
    source: brandSchemas.itemId,
    target: brandSchemas.itemId,
    type: brandSchemas.linkTypeName,
    addedBy: actorRefSchema,
    addedAt: brandSchemas.instant,
    removedAt: brandSchemas.instant.nullable(),
  }),
  levers: factSchemas['boxxy.lever.recorded'],
  attempts: z.object({
    id: brandSchemas.attemptId,
    item: brandSchemas.itemId,
    phase: brandSchemas.phaseName,
    number: z.number().int().positive(),
    runner: brandSchemas.runnerId,
    recipeHash: brandSchemas.recipeHash,
    rulesVersion: brandSchemas.rulesVersion,
    pool: brandSchemas.poolName,
    slot: countSchema,
    slotGen: countSchema,
    leaseGen: countSchema,
    spawnRequest: z.json(),
    spawnRequestHash: contentHashSchema,
    state: z.enum(['starting', 'running', 'reconciling', 'succeeded', 'failed']),
    failure: z.string().nullable(),
    atcSession: brandSchemas.atcSessionId.nullable(),
    closeOut: buildCloseOutSchema.nullable(),
    claimedAt: brandSchemas.instant,
    startedAt: brandSchemas.instant.nullable(),
    endedAt: brandSchemas.instant.nullable(),
  }),
  attempt_sessions: z.object({
    attempt: brandSchemas.attemptId,
    agentSession: brandSchemas.agentSessionId,
    atcSession: brandSchemas.atcSessionId,
    seenAt: brandSchemas.instant,
  }),
  leases: z.object({
    item: brandSchemas.itemId,
    phase: brandSchemas.phaseName,
    attempt: brandSchemas.attemptId,
    gen: countSchema,
    takenAt: brandSchemas.instant,
    releasedAt: brandSchemas.instant.nullable(),
  }),
  pool_slots: z.object({
    pool: brandSchemas.poolName,
    slot: countSchema,
    holder: brandSchemas.attemptId.nullable(),
    gen: countSchema,
    retired: z.boolean(),
  }),
  decisions: factSchemas['boxxy.decision.recorded'],
  evidence: z.object({
    factId: brandSchemas.factId,
    attempt: brandSchemas.attemptId,
    kind: z.enum(['pr', 'commit', 'test', 'ci-run', 'live-check']),
    ref: z.string().min(1),
    observed: z.string().nullable(),
    source: z.enum(['hook', 'trailer', 'agent', 'watch']),
    at: brandSchemas.instant,
  }),
  pull_requests: z.object({
    repo: brandSchemas.repoName,
    number: z.number().int().positive(),
    attempt: brandSchemas.attemptId,
    state: z.enum(['open', 'closed', 'merged']),
    mergedAt: brandSchemas.instant.nullable(),
    mergeCommit: brandSchemas.commitSha.nullable(),
    checkedAt: brandSchemas.instant,
  }),
  runners: z.object({
    id: brandSchemas.runnerId,
    heartbeatAt: brandSchemas.instant,
    paused: z.boolean(),
  }),
};
