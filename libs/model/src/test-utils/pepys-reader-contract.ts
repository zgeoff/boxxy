import { faker } from '@faker-js/faker';
import type { PepysReader } from '../ports/types.ts';
import type { CostToLand } from '../reports/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { ItemId } from '../types.ts';
import { buildMockCostToLand } from './build-mock-cost-to-land.ts';

export interface PepysReaderHarness {
  readonly reader: PepysReader;

  // the environment the reader passes to the stage times
  readonly environment: string;

  // pepys holds this cost for the item
  writeCost: (item: ItemId, cost: CostToLand) => Promise<void>;

  // every later call finds pepys down
  takeDown: () => Promise<void>;
}

export type PepysReaderCase = readonly [
  title: string,
  check: (harness: PepysReaderHarness) => Promise<{ received: unknown; expected: unknown }>,
];

// The cases that every adapter of the reader port must pass: the fake, and the pepys adapter
// behind the plug-in's queries. Each case gets a harness with an empty pepys.
export const pepysReaderContract: readonly PepysReaderCase[] = [
  [
    'an item that pepys holds no fact of gives the empty cost, not unavailable',
    async (harness) => {
      const item = buildItemId();

      return {
        received: await harness.reader.readCostToLand(item),
        expected: {
          kind: 'value',
          value: {
            item: `boxxy:item:${item}`,
            landedAt: null,
            attempts: 0,
            lines: [],
            totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
          },
        },
      };
    },
  ],
  [
    'an item that pepys holds no fact of gives seven steps with null minutes',
    async (harness) => {
      const item = buildItemId();
      const empty = { minutes: null, endedAt: null };

      return {
        received: await harness.reader.readStageTime(item),
        expected: {
          kind: 'value',
          value: {
            item: `boxxy:item:${item}`,
            environment: harness.environment,
            steps: [
              { step: 'triage', ...empty },
              { step: 'design', ...empty },
              { step: 'build', ...empty },
              { step: 'review', ...empty },
              { step: 'merge', ...empty },
              { step: 'release', ...empty },
              { step: 'deploy', ...empty },
            ],
            rework: { count: 0, minutes: 0, unrelatedLines: null },
            reviewWaitMinutes: null,
            sleepMinutes: 0,
            pullRequests: [],
          },
        },
      };
    },
  ],
  [
    'a cost that pepys holds comes back whole',
    async (harness) => {
      const item = buildItemId();
      const cost = buildMockCostToLand({ item: `boxxy:item:${item}` });

      await harness.writeCost(item, cost);

      return {
        received: await harness.reader.readCostToLand(item),
        expected: { kind: 'value', value: cost },
      };
    },
  ],
  [
    'a pepys that is down gives unavailable with a reason for both reads',
    async (harness) => {
      const item = buildItemId();

      await harness.takeDown();

      return {
        received: [
          await harness.reader.readCostToLand(item),
          await harness.reader.readStageTime(item),
        ].map((answer) => ({ kind: answer.kind, hasReason: 'reason' in answer })),
        expected: [
          { kind: 'unavailable', hasReason: true },
          { kind: 'unavailable', hasReason: true },
        ],
      };
    },
  ],
];

function buildItemId(): ItemId {
  return brandSchemas.itemId.parse(faker.string.uuid({ version: 7 }));
}
