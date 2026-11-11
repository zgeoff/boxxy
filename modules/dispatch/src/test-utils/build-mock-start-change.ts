import { brandSchemas } from '@boxxy/model';
import type { SliceOneAttemptRow as AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

export function buildMockStartChange(attempt: AttemptRow): StoreChange {
  const atcSession = brandSchemas.atcSessionId.parse('atc-session-1');
  const startedAt = brandSchemas.instant.parse(2500);

  return {
    at: startedAt,
    under: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: 'starting' },
        set: { state: 'running', atcSession, startedAt },
      },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.started',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: { atcSession },
      },
    ],
  };
}
