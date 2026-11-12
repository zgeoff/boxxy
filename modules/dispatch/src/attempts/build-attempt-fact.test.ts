import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildAttemptFact } from './build-attempt-fact.ts';
import type { AttemptFactType, MoveEvent } from './types.ts';

function setupTest() {
  return {
    envelope: {
      id: brandSchemas.factId.parse('0190a6f4-0000-7000-8000-000000000001'),
      actor: 'boxxy:runner:runner-1' as const,
      now: brandSchemas.instant.parse(5000),
    },
  };
}

test.each<
  [
    title: string,
    type: AttemptFactType,
    before: Partial<AttemptRow>,
    event: MoveEvent,
    payload: Record<string, unknown>,
  ]
>([
  [
    'started',
    'boxxy.attempt.started',
    {},
    {
      kind: 'started',
      via: 'start',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: { issuer: 'https://id.test', subject: 'session-1' },
      resumeFallback: true,
    },
    {
      atcSession: 'atc-1',
      resumeFallback: true,
      caller: { issuer: 'https://id.test', subject: 'session-1' },
    },
  ],
  [
    'reconciled',
    'boxxy.attempt.reconciled',
    {},
    {
      kind: 'started',
      via: 'reconcile',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: null,
      resumeFallback: false,
    },
    { atcSession: 'atc-1', caller: null },
  ],
  [
    'spawn_unanswered',
    'boxxy.attempt.spawn_unanswered',
    {},
    { kind: 'spawn-unanswered', reason: 'timeout' },
    { reason: 'timeout' },
  ],
  [
    'session_bound',
    'boxxy.attempt.session_bound',
    {},
    {
      kind: 'session-seen',
      row: {
        attempt: brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-0000000000aa'),
        agentSession: brandSchemas.agentSessionId.parse('agent-1'),
        atcSession: brandSchemas.atcSessionId.parse('atc-1'),
        product: 'claude_code',
        source: 'hook',
        seenAt: brandSchemas.instant.parse(4000),
      },
    },
    {
      atcSession: 'atc-1',
      agentSession: 'agent-1',
      product: 'claude_code',
      source: 'hook',
      seenAt: 4000,
    },
  ],
  [
    'slept',
    'boxxy.attempt.slept',
    {},
    { kind: 'slept', idleSince: brandSchemas.instant.parse(3000), asked: false },
    { idleSince: 3000, asked: false },
  ],
  [
    'wake_requested',
    'boxxy.attempt.wake_requested',
    {},
    { kind: 'wake-requested', by: 'host-slept-unasked' },
    { by: 'host-slept-unasked' },
  ],
  [
    'resumed',
    'boxxy.attempt.resumed',
    {},
    { kind: 'resumed', atcSession: brandSchemas.atcSessionId.parse('atc-2'), caller: null },
    { atcSession: 'atc-2', caller: null },
  ],
  [
    'closed_out',
    'boxxy.attempt.closed_out',
    {},
    {
      kind: 'closed-out',
      closeOut: {
        result: { kind: 'built' },
        criteria: [],
        openItems: [],
        friction: [],
        frictionDropped: 0,
      },
      hash: buildMockV1AttemptRow({ spawnRequest: { prompt: 'close' } }).spawnRequestHash,
    },
    {
      phase: 'build',
      closeOut: {
        result: { kind: 'built' },
        criteria: [],
        openItems: [],
        friction: [],
        frictionDropped: 0,
      },
      hash: buildMockV1AttemptRow({ spawnRequest: { prompt: 'close' } }).spawnRequestHash,
    },
  ],
  [
    'timed_out',
    'boxxy.attempt.timed_out',
    {},
    { kind: 'timed-out', afterMinutes: 90 },
    { phase: 'build', afterMinutes: 90 },
  ],
  ['turn_ended', 'boxxy.attempt.turn_ended', {}, { kind: 'turn-ended' }, { phase: 'build' }],
  [
    'settled of an attempt that slept',
    'boxxy.attempt.settled',
    { state: 'sleeping', closing: null, round: 2 },
    {
      kind: 'settled',
      state: 'failed',
      failure: 'item-closed',
      outcome: 'lost',
      returnedOutcome: null,
      sessionStopped: true,
      criteria: [],
      matched: [],
      frictionDropped: 0,
      skippedEffects: [],
    },
    {
      phase: 'build',
      round: 2,
      state: 'failed',
      failure: 'item-closed',
      outcome: 'lost',
      returnedOutcome: null,
      closing: null,
      asleep: true,
      sessionStopped: true,
      endedAt: 5000,
      criteria: [],
      matched: [],
      frictionDropped: 0,
      skippedEffects: [],
    },
  ],
])('it fills the %s fact from the move', (...testCase) => {
  const [, type, before, event, payload] = testCase;
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow(before);

  const fact: unknown = buildAttemptFact(
    type,
    { before: attempt, after: attempt, event, decision: null },
    ctx.envelope,
  );

  expect(fact).toStrictEqual({
    id: '0190a6f4-0000-7000-8000-000000000001',
    type,
    entity: `boxxy:item:${attempt.item}`,
    actor: 'boxxy:runner:runner-1',
    payload: { attempt: attempt.id, ...payload },
  });
});

test('it throws on a fact the move does not record', () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow();

  expect(() =>
    buildAttemptFact(
      'boxxy.attempt.turn_ended',
      { before: attempt, after: attempt, event: { kind: 'stalled' }, decision: null },
      ctx.envelope,
    ),
  ).toThrowWithMessage(Error, /cannot record/u);
});
