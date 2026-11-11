import type { EntityRef } from '@boxxy/model';
import { buildMockWorkFact } from '@boxxy/model/test-utils/build-mock-work-fact';
import type { MockedFactType } from '@boxxy/model/test-utils/build-mock-work-fact';
import { z } from 'zod';
import { toWireFact } from '../sink/to-wire-fact.ts';
import type { WorkFact } from '../work/types.ts';

interface ScopeFactOverrides {
  readonly payload?: Readonly<Record<string, unknown>>;

  // ISO 8601, as boxxy's sink writes it
  readonly at?: string;
  readonly entity?: EntityRef;

  // the event of the fact ID `event:boxxy:<event>`
  readonly event?: string;
}

const base = { id: z.string(), entity: z.string(), at: z.string() };
const ofAttempt = { attempt: z.string() };
const callerSchema = z.object({ issuer: z.string(), subject: z.string() }).nullable();

const filedPayload = z.object({
  kind: z.string(),
  repo: z.string(),
  title: z.string(),
  fields: z.object({ designMode: z.unknown().optional() }),
});

const editedPayload = z.object({
  title: z.unknown().optional(),
  kind: z.unknown().optional(),
  fields: z.unknown().optional(),
});

const closedPayload = z.object({ reason: z.string() });

const claimedPayload = z.object({
  ...ofAttempt,
  phase: z.string(),
  number: z.number(),
  round: z.number(),
  mode: z.string(),
  pool: z.string(),
  recipeHash: z.string(),
  rulesVersion: z.string(),
});

const sessionPayload = z.object({ ...ofAttempt, atcSession: z.string(), caller: callerSchema });

const boundPayload = z.object({
  ...ofAttempt,
  atcSession: z.string(),
  agentSession: z.string(),
  product: z.string(),
});

const settledPayload = z.object({
  ...ofAttempt,
  state: z.string(),
  outcome: z.string(),
  failure: z.string().nullable(),
  asleep: z.boolean(),
});

const linkedPayload = z.object({ ...ofAttempt, pullRequestId: z.string() });

const sessionTypes = z.enum([
  'boxxy.attempt.started',
  'boxxy.attempt.reconciled',
  'boxxy.attempt.resumed',
]);

const markPayload = z.object(ofAttempt);

const markTypes = z.enum([
  'boxxy.attempt.slept',
  'boxxy.attempt.woken',
  'boxxy.attempt.closed_out',
]);

const scopeFactSchema: z.ZodType<WorkFact> = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('boxxy.item.filed'), payload: filedPayload }),
  z.object({ ...base, type: z.literal('boxxy.item.edited'), payload: editedPayload }),
  z.object({ ...base, type: z.literal('boxxy.item.closed'), payload: closedPayload }),
  z.object({ ...base, type: z.literal('boxxy.attempt.claimed'), payload: claimedPayload }),
  z.object({ ...base, type: sessionTypes, payload: sessionPayload }),
  z.object({ ...base, type: z.literal('boxxy.attempt.session_bound'), payload: boundPayload }),
  z.object({ ...base, type: markTypes, payload: markPayload }),
  z.object({ ...base, type: z.literal('boxxy.attempt.settled'), payload: settledPayload }),
  z.object({ ...base, type: z.literal('boxxy.pull_request.linked'), payload: linkedPayload }),
]);

// One fact as the consumer reads it from its scope: a model fact whose payload its schema
// accepts, sent through the sink's wire form, with the fact ID that ingest gives it. The payload
// is read the way the glue's decoder reads it, so a field the fold needs and the model lacks fails.
export function buildMockScopeFact(
  type: MockedFactType,
  overrides: ScopeFactOverrides = {},
): WorkFact {
  const at = overrides.at ?? '2026-11-11T02:00:00.000Z';

  const wire = toWireFact(
    buildMockWorkFact(type, {
      ...(overrides.payload === undefined ? {} : { payload: overrides.payload }),
      ...(overrides.entity === undefined ? {} : { entity: overrides.entity }),
      at: Date.parse(at),
    }),
  );

  return scopeFactSchema.parse({
    id: `event:boxxy:${overrides.event ?? wire.event}`,
    type: wire.type,
    entity: wire.entity,
    at: wire.at,
    payload: wire.payload,
  });
}
