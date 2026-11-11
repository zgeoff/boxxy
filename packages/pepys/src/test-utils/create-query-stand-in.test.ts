import { expect, test } from 'bun:test';
import { buildMockCostToLand } from '@boxxy/model/test-utils/build-mock-cost-to-land';
import { createQueryStandIn } from './create-query-stand-in.ts';

test('it answers the cost set for the item, and the empty cost for another', async () => {
  const queries = createQueryStandIn();
  const cost = buildMockCostToLand({ item: 'boxxy:item:i-1' });

  queries.setCost('boxxy:item:i-1', cost);

  const answers = [
    await queries.client.boxxy_cost_to_land({ item: 'boxxy:item:i-1' }),
    await queries.client.boxxy_cost_to_land({ item: 'boxxy:item:i-2' }),
  ];

  expect(answers).toStrictEqual([
    cost,
    {
      item: 'boxxy:item:i-2',
      landedAt: null,
      attempts: 0,
      lines: [],
      totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
    },
  ]);
});

test('it rejects every call once taken down', async () => {
  const queries = createQueryStandIn();

  queries.takeDown();

  const answer = queries.client.boxxy_stage_time({
    item: 'boxxy:item:i-1',
    environment: 'production',
  });

  await expect(answer).toReject();
});
