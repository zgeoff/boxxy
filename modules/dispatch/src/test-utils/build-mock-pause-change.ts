import { brandSchemas } from '@boxxy/model';
import type { RunnerId, StoreChange } from '@boxxy/model';

// A bare pause of the runner's row, for the cases that test the store with no fact in the way.
export function buildMockPauseChange(runner: RunnerId): StoreChange {
  return {
    at: brandSchemas.instant.parse(1500),
    writes: [
      {
        op: 'update',
        table: 'runners',
        key: { id: runner },
        expect: { paused: false },
        set: { paused: true },
      },
    ],
    facts: [],
  };
}
