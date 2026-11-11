import type { SliceOneLeverRow as LeverRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

export function buildMockLeverChange(lever: LeverRow): StoreChange {
  return {
    at: lever.at,
    writes: [{ op: 'insert', table: 'levers', row: lever }],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.lever.recorded',
        entity: `boxxy:item:${lever.item}`,
        actor: lever.actor,
        payload: lever,
      },
    ],
  };
}
