import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

interface SettleInput {
  readonly attempt: AttemptRow;
  readonly state: 'succeeded' | 'failed';
}

// A settle under the live lease and hold generations: it releases the lease and the seats. A
// succeeded attempt ends `built`; a failed one ends `lost` with `closeout-missing`.
export function buildMockSettleChange(input: SettleInput): StoreChange {
  const attempt = input.attempt;
  const endedAt = brandSchemas.instant.parse(3000);
  const isSucceeded = input.state === 'succeeded';
  const failure = isSucceeded ? null : 'closeout-missing';
  const outcome = isSucceeded ? brandSchemas.outcomeName.parse('built') : 'lost';

  return {
    at: endedAt,
    under: {
      item: attempt.item,
      phase: attempt.phase,
      gen: attempt.leaseGen,
      holdGen: attempt.holdGen,
    },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: attempt.state },
        set: { state: input.state, failure, outcome, endedAt },
      },
      {
        op: 'update',
        table: 'leases',
        key: { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen },
        expect: { releasedAt: null },
        set: { releasedAt: endedAt },
      },
      { op: 'release-seats', release: { attempt: attempt.id, holdGen: attempt.holdGen } },
    ],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.attempt.settled',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          attempt: attempt.id,
          phase: attempt.phase,
          round: attempt.round,
          state: input.state,
          failure,
          outcome,
          returnedOutcome: null,
          closing: null,
          asleep: false,
          sessionStopped: true,
          endedAt,
          criteria: [],
          matched: [],
          frictionDropped: 0,
          skippedEffects: [],
        },
      },
    ],
  };
}
