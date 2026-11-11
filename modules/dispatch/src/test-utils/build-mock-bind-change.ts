import { brandSchemas } from '@boxxy/model';
import type { AgentSessionId, AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import invariant from 'tiny-invariant';

interface BindInput {
  readonly attempt: AttemptRow;
  readonly agentSession: AgentSessionId;
}

// The session-start hook binds a Claude agent session to the attempt's atc session.
export function buildMockBindChange(input: BindInput): StoreChange {
  const attempt = input.attempt;
  const agentSession = input.agentSession;
  const atcSession = attempt.atcSession;
  const seenAt = brandSchemas.instant.parse(2500);

  invariant(atcSession !== null, 'a bound attempt names its atc session');

  const row = {
    attempt: attempt.id,
    agentSession,
    atcSession,
    product: 'claude_code',
    source: 'hook',
    seenAt,
  } as const;

  return {
    at: seenAt,
    under: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
    writes: [{ op: 'insert', table: 'attempt_sessions', row }],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.session_bound',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:hook:${attempt.id}`,
        payload: row,
      },
    ],
  };
}
