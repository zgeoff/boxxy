import { contentHash } from '@boxxy/content-hash';
import { faker } from '@faker-js/faker';
import type { z } from 'zod';
import type { EntityRef, OutboxFact, WorkFacts } from '../facts/types.ts';
import { workFactSchemas } from '../facts/work-fact-schemas.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { Instant } from '../types.ts';
import { toJSONValue } from '../utils/to-json-value.ts';
import { buildMockFactId } from './build-mock-fact-id.ts';

// The fact types that the pepys consumer reads.
export type MockedFactType =
  | 'boxxy.item.filed'
  | 'boxxy.item.edited'
  | 'boxxy.item.closed'
  | 'boxxy.attempt.claimed'
  | 'boxxy.attempt.started'
  | 'boxxy.attempt.reconciled'
  | 'boxxy.attempt.resumed'
  | 'boxxy.attempt.session_bound'
  | 'boxxy.attempt.slept'
  | 'boxxy.attempt.woken'
  | 'boxxy.attempt.closed_out'
  | 'boxxy.attempt.settled'
  | 'boxxy.pull_request.linked';

// The payload's values are checked by the schema, so a test may give a plain string for a brand.
interface WorkFactOverrides<Type extends MockedFactType> {
  readonly payload?: { readonly [Key in keyof WorkFacts[Type]]?: unknown };
  readonly at?: number;
  readonly entity?: EntityRef;
  readonly seq?: number;
}

const hashOptions = { length: 64, casing: 'lower', prefix: '' } as const;

const defaultPayloads: { readonly [Type in MockedFactType]: () => WorkFacts[Type] } = {
  'boxxy.item.filed': () => ({
    id: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    kind: brandSchemas.itemKindName.parse('core.issue'),
    repo: brandSchemas.repoName.parse('shoal/charts'),
    title: faker.lorem.sentence(),
    outcome: faker.lorem.sentence(),
    acceptance: [],
    fields: {},
    labels: [],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: toInstant(1_800_000_000_000),
    closedAt: null,
    closeReason: null,
  }),
  'boxxy.item.edited': () => ({ byAttempt: null }),
  'boxxy.item.closed': () => ({ reason: 'done', byAttempt: null, ended: [] }),
  'boxxy.attempt.claimed': () => ({
    attempt: buildAttemptId(),
    phase: brandSchemas.phaseName.parse('build'),
    number: 1,
    round: 1,
    mode: 'agent',
    pool: brandSchemas.poolName.parse('main'),
    fields: {},
    seats: [],
    recipeHash: brandSchemas.recipeHash.parse(faker.string.hexadecimal(hashOptions)),
    skillsRef: null,
    rulesVersion: brandSchemas.rulesVersion.parse(faker.string.hexadecimal(hashOptions)),
  }),
  'boxxy.attempt.started': () => ({
    attempt: buildAttemptId(),
    atcSession: buildAtcSession(),
    resumeFallback: false,
    caller: null,
  }),
  'boxxy.attempt.reconciled': () => ({
    attempt: buildAttemptId(),
    atcSession: buildAtcSession(),
    caller: null,
  }),
  'boxxy.attempt.resumed': () => ({
    attempt: buildAttemptId(),
    atcSession: buildAtcSession(),
    caller: null,
  }),
  'boxxy.attempt.session_bound': () => ({
    attempt: buildAttemptId(),
    atcSession: buildAtcSession(),
    agentSession: brandSchemas.agentSessionId.parse(`agent-${faker.string.alphanumeric(8)}`),
    product: 'claude_code',
    source: 'hook',
    seenAt: toInstant(1_800_000_000_000),
  }),
  'boxxy.attempt.slept': () => ({
    attempt: buildAttemptId(),
    idleSince: toInstant(1_800_000_000_000),
    asked: true,
  }),
  'boxxy.attempt.woken': () => ({
    attempt: buildAttemptId(),
    holdGen: 1,
    seats: [],
    overCap: false,
  }),
  'boxxy.attempt.closed_out': () => {
    const closeOut = {
      result: { kind: 'accepted' as const },
      relations: [],
      friction: [],
      frictionDropped: 0,
    };

    return {
      attempt: buildAttemptId(),
      phase: brandSchemas.phaseName.parse('triage'),
      closeOut,
      hash: contentHash(closeOut),
    };
  },
  'boxxy.attempt.settled': () => ({
    attempt: buildAttemptId(),
    phase: brandSchemas.phaseName.parse('build'),
    round: 1,
    state: 'succeeded',
    failure: null,
    outcome: 'built',
    returnedOutcome: null,
    closing: 'closed-out',
    asleep: false,
    sessionStopped: true,
    endedAt: toInstant(1_800_000_000_000),
    criteria: [],
    matched: [],
    frictionDropped: 0,
    skippedEffects: [],
  }),
  'boxxy.pull_request.linked': () => ({
    attempt: buildAttemptId(),
    repo: brandSchemas.repoName.parse('shoal/charts'),
    number: 14,
    url: 'https://github.com/shoal/charts/pull/14',
    pullRequestId: '9001',
    source: 'hook',
  }),
};

// An unsent outbox row of the type, with every payload field the test does not give filled with a
// valid value. The payload passes the type's schema, or the factory throws.
export function buildMockWorkFact<Type extends MockedFactType>(
  type: Type,
  overrides: WorkFactOverrides<Type> = {},
): OutboxFact {
  const schema: z.ZodType = workFactSchemas[type];
  const payload = schema.parse({ ...defaultPayloads[type](), ...overrides.payload });
  const seq = overrides.seq ?? 1;

  return {
    seq,
    factId: buildMockFactId(),
    type,
    entity: overrides.entity ?? `boxxy:item:${faker.string.uuid({ version: 7 })}`,
    actor: 'boxxy:owner:local',
    at: toInstant(overrides.at ?? 1_800_000_000_000),
    payload: toJSONValue(payload),
    sentAt: null,
    parkedAt: null,
    parkedReason: null,
  };
}

function toInstant(at: number): Instant {
  return brandSchemas.instant.parse(at);
}

function buildAttemptId() {
  return brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 }));
}

function buildAtcSession() {
  return brandSchemas.atcSessionId.parse(`s-${faker.string.alphanumeric(8)}`);
}
