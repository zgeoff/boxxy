import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockBindChange } from './build-mock-bind-change.ts';

test('it builds a change that binds an agent session to the attempt', () => {
  const atcSession = brandSchemas.atcSessionId.parse('atc-session-1');
  const attempt = buildMockV1AttemptRow({ state: 'running', leaseGen: 2, atcSession });
  const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');
  const change: unknown = buildMockBindChange({ attempt, agentSession });

  const row = {
    attempt: attempt.id,
    agentSession: 'agent-session-1',
    atcSession: 'atc-session-1',
    product: 'claude_code',
    source: 'hook',
    seenAt: 2500,
  };

  expect(change).toStrictEqual({
    at: 2500,
    under: { item: attempt.item, phase: attempt.phase, gen: 2 },
    writes: [{ op: 'insert', table: 'attempt_sessions', row }],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.attempt.session_bound',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:hook:${attempt.id}`,
        payload: row,
      },
    ],
  });
});

test('it throws for an attempt with no atc session', () => {
  const attempt = buildMockV1AttemptRow({ atcSession: null });
  const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');

  expect(() => buildMockBindChange({ attempt, agentSession })).toThrow();
});
