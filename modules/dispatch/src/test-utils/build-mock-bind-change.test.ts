import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockBindChange } from './build-mock-bind-change.ts';

test('it builds a change that binds an agent session to the attempt', () => {
  const attempt = buildMockAttemptRow({ state: 'running', leaseGen: 2 });
  const agentSession = brandSchemas.agentSessionId.parse('agent-session-1');
  const change: unknown = buildMockBindChange({ attempt, agentSession });

  expect(change).toStrictEqual({
    at: 2500,
    under: { item: attempt.item, phase: attempt.phase, gen: 2 },
    writes: [
      {
        op: 'insert',
        table: 'attempt_sessions',
        row: {
          attempt: attempt.id,
          agentSession: 'agent-session-1',
          atcSession: 'atc-session-1',
          seenAt: 2500,
        },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.attempt.session_bound',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: { atcSession: 'atc-session-1', agentSession: 'agent-session-1', seenAt: 2500 },
      },
    ],
  });
});
