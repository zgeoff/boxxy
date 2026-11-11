import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, CallerIdentity, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import invariant from 'tiny-invariant';

// The start of a `starting` attempt on its own atc session, with the caller the worker reported.
export function buildMockStartChange(
  attempt: AttemptRow,
  caller: CallerIdentity | null = null,
): StoreChange {
  const atcSession = attempt.atcSession;
  const startedAt = brandSchemas.instant.parse(2500);

  invariant(atcSession !== null, 'a started attempt names its atc session');

  return {
    at: startedAt,
    under: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: 'starting' },
        set: { state: 'running', atcSession, caller, startedAt },
      },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.started',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: { attempt: attempt.id, atcSession, resumeFallback: false, caller },
      },
    ],
  };
}
