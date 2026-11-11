import { z } from 'zod';
import { buildCloseOutSchema } from '../closeouts/build-close-out-schema.ts';
import { frictionSchema } from '../closeouts/friction-schema.ts';
import { actorRefSchema } from '../rows/actor-ref-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { FactType, SliceOneFacts } from './types.ts';

const criterionSchema = z.object({
  id: brandSchemas.criterionId,
  text: z.string().min(1),
  evidence: z.array(brandSchemas.factId),
});

const linkPayloadSchema = z.object({
  source: brandSchemas.itemId,
  target: brandSchemas.itemId,
  type: brandSchemas.linkTypeName,
});

const faultSchema = z.object({
  plugin: z.string().min(1),
  kind: z.enum(['signal', 'gate', 'waiver', 'admission', 'propagation', 'filter-field']),
  item: brandSchemas.itemId.nullable(),
  error: z.string(),
});

const copiedEvidenceSchema = z.object({
  criterion: brandSchemas.criterionId,
  evidence: z.array(brandSchemas.factId),
});

const pullRequestNumberSchema = z.number().int().positive();

export const factSchemas: { readonly [T in FactType]: z.ZodType<SliceOneFacts[T]> } = {
  'boxxy.item.filed': z.object({
    id: brandSchemas.itemId,
    kind: brandSchemas.itemKindName,
    repo: brandSchemas.repoName,
    title: z.string().min(1),
    outcome: z.string().min(1),
    acceptance: z.array(criterionSchema),
    foundInAttempt: brandSchemas.attemptId.nullable(),
    filedBy: actorRefSchema,
    filedAt: brandSchemas.instant,
    closedAt: brandSchemas.instant.nullable(),
    closeReason: z.string().nullable(),
  }),
  'boxxy.item.edited': z
    .object({
      title: z.string().min(1).exactOptional(),
      outcome: z.string().min(1).exactOptional(),
      acceptance: z.array(criterionSchema).exactOptional(),
    })
    .refine((fields) => Object.keys(fields).length > 0, 'an edit changes at least one field'),
  'boxxy.item.closed': z.object({ reason: z.string().min(1) }),
  'boxxy.link.added': linkPayloadSchema,
  'boxxy.link.removed': linkPayloadSchema,
  'boxxy.lever.recorded': z.object({
    seq: z.number().int().nonnegative(),
    kind: z.templateLiteral([z.string().min(1), '.', z.string().min(1)]),
    item: brandSchemas.itemId,
    until: brandSchemas.instant.nullable(),
    expiresAt: brandSchemas.instant.nullable(),
    reason: z.string().nullable(),
    actor: actorRefSchema,
    at: brandSchemas.instant,
  }),
  'boxxy.attempt.claimed': z.object({
    item: brandSchemas.itemId,
    phase: brandSchemas.phaseName,
    number: z.number().int().positive(),
    pool: brandSchemas.poolName,
    slot: z.number().int().nonnegative(),
    gen: z.number().int().nonnegative(),
    recipeHash: brandSchemas.recipeHash,
    rulesVersion: brandSchemas.rulesVersion,
  }),
  'boxxy.decision.recorded': z.object({
    id: brandSchemas.decisionId,
    attempt: brandSchemas.attemptId,
    item: brandSchemas.itemId,
    pool: brandSchemas.poolName,
    rulesVersion: brandSchemas.rulesVersion,
    snapshotHash: brandSchemas.snapshotHash,
    storeVersion: z.number().int().nonnegative(),
    pepysOffsets: z.record(brandSchemas.streamName, z.number().int().nonnegative()),
    faults: z.array(faultSchema),
    at: brandSchemas.instant,
  }),
  'boxxy.attempt.started': z.object({ atcSession: brandSchemas.atcSessionId }),
  'boxxy.attempt.reconciling': z.object({ reason: z.string().min(1) }),
  'boxxy.attempt.reconciled': z.object({ atcSession: brandSchemas.atcSessionId }),
  'boxxy.attempt.session_bound': z.object({
    atcSession: brandSchemas.atcSessionId,
    agentSession: brandSchemas.agentSessionId,
    seenAt: brandSchemas.instant,
  }),
  'boxxy.attempt.closed_out': z.object({ closeOut: buildCloseOutSchema }),
  'boxxy.attempt.settled': z.object({
    state: z.enum(['succeeded', 'failed']),
    failure: z.string().min(1).nullable(),
    endedAt: brandSchemas.instant,
    criteria: z.array(copiedEvidenceSchema),
    matched: z.array(brandSchemas.itemId),
    frictionDropped: z.number().int().nonnegative(),
  }),
  'boxxy.evidence.recorded': z.object({
    kind: z.enum(['pr', 'commit', 'test', 'ci-run', 'live-check']),
    ref: z.string().min(1),
    observed: z.string().nullable(),
  }),
  'boxxy.evidence.pr_linked': z.object({
    repo: brandSchemas.repoName,
    number: pullRequestNumberSchema,
    url: z.url(),
  }),
  'boxxy.evidence.commit_linked': z.object({
    repo: brandSchemas.repoName,
    sha: brandSchemas.commitSha,
    pr: pullRequestNumberSchema,
  }),
  'boxxy.pr.merged': z.object({
    repo: brandSchemas.repoName,
    number: pullRequestNumberSchema,
    mergedAt: brandSchemas.instant,
    mergeCommit: brandSchemas.commitSha,
  }),
  'boxxy.pr.closed': z.object({ repo: brandSchemas.repoName, number: pullRequestNumberSchema }),
  'boxxy.proposal.recorded': frictionSchema,
  'boxxy.runner.paused': z.object({ runner: brandSchemas.runnerId }),
  'boxxy.runner.resumed': z.object({ runner: brandSchemas.runnerId }),
};
