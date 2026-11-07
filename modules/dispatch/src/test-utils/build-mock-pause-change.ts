import { brandSchemas } from '@boxxy/model';
import type { RunnerId, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

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
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.runner.paused',
        entity: `boxxy:runner:${runner}`,
        actor: 'boxxy:owner:local',
        payload: { runner },
      },
    ],
  };
}
