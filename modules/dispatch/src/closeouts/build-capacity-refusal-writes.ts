import type { AttemptRow, CapacityRefusalId, Instant, RefusalDetail, RowWrite } from '@boxxy/model';
import invariant from 'tiny-invariant';

interface CapacityRefusalInput {
  readonly attempt: AttemptRow;
  readonly id: CapacityRefusalId;
  readonly refusal: RefusalDetail | null;
  readonly now: Instant;
}

// The writes that record a spawn refused for capacity. The attempt builder removes the attempt.
export function buildCapacityRefusalWrites(input: CapacityRefusalInput): RowWrite[] {
  invariant(input.attempt.pool !== null, 'a spawned attempt was picked into a pool');

  return [
    {
      op: 'insert',
      table: 'capacity_refusals',
      row: {
        id: input.id,
        attempt: input.attempt.id,
        item: input.attempt.item,
        phase: input.attempt.phase,
        pool: input.attempt.pool,
        at: input.now,
        refusal: input.refusal,
      },
    },
  ];
}
