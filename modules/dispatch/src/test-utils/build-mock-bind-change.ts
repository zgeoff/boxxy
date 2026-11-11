import { brandSchemas } from '@boxxy/model';
import type { AgentSessionId, SliceOneAttemptRow as AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

interface BindInput {
  readonly attempt: AttemptRow;
  readonly agentSession: AgentSessionId;
}

export function buildMockBindChange(input: BindInput): StoreChange {
  const attempt = input.attempt;
  const agentSession = input.agentSession;
  const atcSession = brandSchemas.atcSessionId.parse('atc-session-1');
  const seenAt = brandSchemas.instant.parse(2500);

  return {
    at: seenAt,
    under: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
    writes: [
      {
        op: 'insert',
        table: 'attempt_sessions',
        row: { attempt: attempt.id, agentSession, atcSession, seenAt },
      },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.session_bound',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: { atcSession, agentSession, seenAt },
      },
    ],
  };
}
