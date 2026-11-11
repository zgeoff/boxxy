import { brandSchemas } from '@boxxy/model';
import type { RunnerId, StoreChange } from '@boxxy/model';

// The fact catalog has no runner fact, so the pause writes the row and no fact.
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
