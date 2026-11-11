import type { PepysAnswer, PepysReader } from '../ports/types.ts';
import { stageSteps } from '../reports/constants.ts';
import type { CostToLand, StageTime } from '../reports/types.ts';
import type { ItemId } from '../types.ts';

interface FakeValues {
  readonly cost?: CostToLand;
  readonly stageTime?: StageTime;
}

export interface FakePepysReader extends PepysReader {
  // an item with no value set answers as pepys does for an item it holds no fact of
  set: (item: ItemId, values: FakeValues) => void;

  // the next call, of either method, answers `unavailable` with this reason; each call of
  // `failNext` fails one more call
  failNext: (reason: string) => void;
}

export function createFakePepysReader(environment = 'production'): FakePepysReader {
  const costs = new Map<ItemId, CostToLand>();
  const stageTimes = new Map<ItemId, StageTime>();

  const failures: string[] = [];

  const answer = <Value>(value: Value): Promise<PepysAnswer<Value>> => {
    const reason = failures.shift();

    const answered: PepysAnswer<Value> =
      reason === undefined ? { kind: 'value', value } : { kind: 'unavailable', reason };

    return Promise.resolve(answered);
  };

  return {
    set: (item, values) => {
      if (values.cost !== undefined) {
        costs.set(item, values.cost);
      }

      if (values.stageTime !== undefined) {
        stageTimes.set(item, values.stageTime);
      }
    },
    failNext: (reason) => {
      failures.push(reason);
    },
    readCostToLand: (item) => answer(costs.get(item) ?? buildEmptyCost(item)),
    readStageTime: (item) => answer(stageTimes.get(item) ?? buildEmptyStageTime(item, environment)),
  };
}

function buildEmptyCost(item: ItemId): CostToLand {
  return {
    item: `boxxy:item:${item}`,
    landedAt: null,
    attempts: 0,
    lines: [],
    totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
  };
}

function buildEmptyStageTime(item: ItemId, environment: string): StageTime {
  return {
    item: `boxxy:item:${item}`,
    environment,
    steps: stageSteps.map((step) => ({ step, minutes: null, endedAt: null })),
    rework: { count: 0, minutes: 0 },
    reviewWaitMinutes: null,
    sleepMinutes: 0,
    pullRequests: [],
  };
}
