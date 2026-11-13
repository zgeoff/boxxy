import { contentHashSchema } from '@boxxy/content-hash';
import { z } from 'zod';
import { closeOutSchema } from '../closeouts/close-out-schema.ts';
import { frictionSchema } from '../closeouts/friction-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { callerIdentitySchema } from '../rows/caller-identity-schema.ts';
import { criterionSchema } from '../rows/criterion-schema.ts';
import { decisionRowSchema } from '../rows/decision-row-schema.ts';
import { itemRowSchema } from '../rows/item-row-schema.ts';
import { leverRowSchema } from '../rows/lever-row-schema.ts';
import type { FactType, WorkFacts } from './types.ts';

const countSchema = z.number().int().nonnegative();
const roundSchema = z.number().int().positive();
const pullRequestNumberSchema = z.number().int().positive();
const pullRequestIdSchema = z.string().regex(/^[1-9]\d*$/u);
const ofAttempt = { attempt: brandSchemas.attemptId };
const seatsSchema = z.array(z.object({ limit: brandSchemas.limitName }));
const designModeSchema = z.enum(['agent', 'attended']);
const editedFieldsSchema = z.object({ designMode: designModeSchema.exactOptional() });
const fieldValuesSchema = z.record(z.string(), z.array(z.string()));

const relationSchema = z.object({
  source: brandSchemas.itemId,
  target: brandSchemas.itemId,
  type: brandSchemas.relationTypeName,
});

const endedAttemptSchema = z.object({
  attempt: brandSchemas.attemptId,
  how: z.enum(['settled', 'closing']),
});

const closingCauseSchema = z.enum([
  'closed-out',
  'timed-out',
  'item-closed',
  'stalled',
  'skill-missing',
  'turn-ended',
  'usage-limit',
]);

const copiedEvidenceSchema = z.object({
  criterion: brandSchemas.criterionId,
  evidence: z.array(brandSchemas.factId),
});

const effectKindSchema = z.enum([
  'file-item',
  'close-item',
  'add-relation',
  'set-kind',
  'set-field',
  'set-acceptance',
  'set-body',
  'record-proposal',
  'record-merge',
]);

const skippedEffectSchema = z.object({ effect: effectKindSchema, reason: z.string().min(1) });

// One schema per fact type, with no `storeVersion`: the wire schema of the pepys package adds
// it. Each schema's output equals its payload type; the test of this file checks both ways.
export const workFactSchemas = {
  // A `filed` fact stored before the body existed has none, and reads as an empty body.
  'boxxy.item.filed': itemRowSchema
    .omit({ keptSession: true })
    .extend({ body: z.string().default('') }),
  'boxxy.item.noted': z.object({ seq: roundSchema, text: z.string().min(1) }),
  'boxxy.item.edited': z.object({
    title: z.string().min(1).exactOptional(),
    outcome: z.string().min(1).exactOptional(),
    body: z.string().exactOptional(),
    acceptance: z.array(criterionSchema).exactOptional(),
    kind: brandSchemas.itemKindName.exactOptional(),
    fields: editedFieldsSchema.exactOptional(),
    labels: z.array(z.string().min(1)).exactOptional(),
    byAttempt: brandSchemas.attemptId.nullable(),
  }),
  'boxxy.item.closed': z.object({
    reason: z.string().min(1),
    byAttempt: brandSchemas.attemptId.nullable(),
    ended: z.array(endedAttemptSchema),
  }),
  'boxxy.relation.added': relationSchema,
  'boxxy.relation.removed': relationSchema,
  'boxxy.lever.recorded': leverRowSchema,
  'boxxy.attempt.claimed': z.object({
    ...ofAttempt,
    phase: brandSchemas.phaseName,
    number: roundSchema,
    round: roundSchema,
    mode: designModeSchema,
    pool: brandSchemas.poolName,
    fields: fieldValuesSchema,
    seats: seatsSchema,
    recipeHash: brandSchemas.recipeHash,
    skillsRef: brandSchemas.commitSha.nullable(),
    rulesVersion: brandSchemas.rulesVersion,
  }),
  'boxxy.decision.recorded': decisionRowSchema
    .omit({ storeVersion: true })
    .extend({ snapshotStoreVersion: countSchema }),
  'boxxy.attempt.started': z.object({
    ...ofAttempt,
    atcSession: brandSchemas.atcSessionId,
    resumeFallback: z.boolean(),
    caller: callerIdentitySchema.nullable(),
  }),
  'boxxy.attempt.spawn_unanswered': z.object({ ...ofAttempt, reason: z.string().min(1) }),
  'boxxy.attempt.reconciled': z.object({
    ...ofAttempt,
    atcSession: brandSchemas.atcSessionId,

    // a fact written before the field existed reads as no fallback
    resumeFallback: z.boolean().default(false),
    caller: callerIdentitySchema.nullable(),
  }),
  'boxxy.attempt.session_bound': z.object({
    ...ofAttempt,
    atcSession: brandSchemas.atcSessionId,
    agentSession: brandSchemas.agentSessionId,
    product: z.enum(['claude_code', 'codex']),
    source: z.enum(['worker', 'hook']),
    seenAt: brandSchemas.instant,
  }),
  'boxxy.attempt.slept': z.object({
    ...ofAttempt,
    idleSince: brandSchemas.instant,
    asked: z.boolean(),
  }),
  'boxxy.attempt.wake_requested': z.object({
    ...ofAttempt,
    by: z.enum(['command', 'session-ran', 'host-slept-unasked']),
  }),
  'boxxy.attempt.woken': z.object({
    ...ofAttempt,
    holdGen: roundSchema,
    seats: seatsSchema,
    overCap: z.boolean(),
  }),
  'boxxy.attempt.resumed': z.object({
    ...ofAttempt,
    atcSession: brandSchemas.atcSessionId,
    caller: callerIdentitySchema.nullable(),
  }),
  'boxxy.attempt.closed_out': z.object({
    ...ofAttempt,
    phase: brandSchemas.phaseName,
    closeOut: closeOutSchema,
    hash: contentHashSchema,
  }),
  'boxxy.attempt.timed_out': z.object({
    ...ofAttempt,
    phase: brandSchemas.phaseName,
    afterMinutes: z.number().positive(),
  }),
  'boxxy.attempt.turn_ended': z.object({ ...ofAttempt, phase: brandSchemas.phaseName }),
  'boxxy.attempt.settled': z.object({
    ...ofAttempt,
    phase: brandSchemas.phaseName,
    round: roundSchema,
    state: z.enum(['succeeded', 'failed']),
    failure: z.string().min(1).nullable(),
    outcome: z.string().min(1),
    returnedOutcome: z.string().min(1).nullable(),
    closing: closingCauseSchema.nullable(),
    asleep: z.boolean(),
    sessionStopped: z.boolean(),
    endedAt: brandSchemas.instant,
    criteria: z.array(copiedEvidenceSchema),
    matched: z.array(brandSchemas.itemId),
    frictionDropped: countSchema,
    skippedEffects: z.array(skippedEffectSchema),
  }),
  'boxxy.proposal.recorded': frictionSchema.extend(ofAttempt),
  'boxxy.evidence.recorded': z.object({
    ...ofAttempt,
    kind: z.enum(['pull_request', 'commit', 'test', 'ci-run', 'live-check']),
    ref: z.string().min(1),
    observed: z.string().nullable(),
  }),
  'boxxy.pull_request.linked': z.object({
    ...ofAttempt,
    repo: brandSchemas.repoName,
    number: pullRequestNumberSchema,
    url: z.url(),
    pullRequestId: pullRequestIdSchema,
    source: z.enum(['hook', 'watch']),
  }),
  'boxxy.commit.linked': z.object({
    ...ofAttempt,
    repo: brandSchemas.repoName,
    sha: brandSchemas.commitSha,
    pullRequestNumber: pullRequestNumberSchema,
  }),
  'boxxy.pull_request.merged': z.object({
    ...ofAttempt,
    repo: brandSchemas.repoName,
    number: pullRequestNumberSchema,
    pullRequestId: pullRequestIdSchema,
    mergedAt: brandSchemas.instant,
    mergeCommit: brandSchemas.commitSha,
  }),
  'boxxy.pull_request.closed': z.object({
    ...ofAttempt,
    repo: brandSchemas.repoName,
    number: pullRequestNumberSchema,
    pullRequestId: pullRequestIdSchema,
  }),
  'boxxy.attempt.job_started': z.object({ ...ofAttempt, worker: brandSchemas.workerKindName }),
  'boxxy.merge.requested': z.object({
    ...ofAttempt,
    repo: brandSchemas.repoName,
    number: pullRequestNumberSchema,
    head: brandSchemas.commitSha,
    method: z.enum(['merge', 'squash', 'rebase']),
    required: z.array(z.string().min(1)),
  }),
  'boxxy.merge.answered': z.object({
    ...ofAttempt,
    head: brandSchemas.commitSha,
    answer: z.enum(['merged', 'queued', 'head-moved', 'not-mergeable']),
    mergeCommit: brandSchemas.commitSha.nullable(),
  }),
} satisfies { readonly [T in FactType]: z.ZodType<WorkFacts[T]> };
