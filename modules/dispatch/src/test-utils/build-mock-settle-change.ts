import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

interface SettleInput {
  // the attempt as claimed, with the slot and slot gen its take got
  readonly attempt: AttemptRow;
  readonly state: 'succeeded' | 'failed';
}

export function buildMockSettleChange(input: SettleInput): StoreChange {
  const attempt = input.attempt;
  const endedAt = brandSchemas.instant.parse(3000);
  const failure = input.state === 'failed' ? 'closeout-missing' : null;

  return {
    at: endedAt,
    under: {
      item: attempt.item,
      phase: attempt.phase,
      gen: attempt.leaseGen,
      slot: { pool: attempt.pool, slot: attempt.slot, gen: attempt.slotGen },
    },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: attempt.state },
        set: { state: input.state, failure, endedAt },
      },
      {
        op: 'update',
        table: 'leases',
        key: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
        expect: { releasedAt: null },
        set: { releasedAt: endedAt },
      },
      { op: 'release-slot', pool: attempt.pool, slot: attempt.slot, holder: attempt.id },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.settled',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          state: input.state,
          failure,
          endedAt,
          criteria: [],
          matched: [],
          frictionDropped: 0,
        },
      },
    ],
  };
}
