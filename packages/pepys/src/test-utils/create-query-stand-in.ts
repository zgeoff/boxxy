import type { CostToLand } from '@boxxy/model';
import { buildCostToLand } from '../queries/build-cost-to-land.ts';
import { buildStageTime } from '../queries/build-stage-time.ts';
import type { UncheckedQueryClient } from '../types.ts';

export interface QueryStandIn {
  readonly client: UncheckedQueryClient;

  // the cost the query answers for the item's entity ID
  setCost: (item: string, cost: CostToLand) => void;

  // every later call fails as a refused connection does
  takeDown: () => void;
}

// The two queries in memory. An item with no cost set answers what each query's builder gives for
// an item with no row.
export function createQueryStandIn(): QueryStandIn {
  const costs = new Map<string, CostToLand>();

  let isDown = false;

  const answer = (value: () => unknown): Promise<unknown> =>
    isDown ? Promise.reject(new Error('connect ECONNREFUSED')) : Promise.resolve(value());

  return {
    client: {
      boxxy_cost_to_land: (input) =>
        answer(
          () =>
            costs.get(input.item) ??
            buildCostToLand({
              item: input.item,
              attempts: [],
              bindings: [],
              requests: [],
              turns: [],
              pullRequests: [],
            }),
        ),
      boxxy_stage_time: (input) =>
        answer(() => buildStageTime({ ...input, attempts: [], deliveries: [] })),
    },
    setCost: (item, cost) => {
      costs.set(item, cost);
    },
    takeDown: () => {
      isDown = true;
    },
  };
}
