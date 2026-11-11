import { expect, test } from 'bun:test';
import { costToLandSchema } from './cost-to-land-schema.ts';

test('it accepts the cost of an item that has not landed, with a line of unknown cost', () => {
  const cost = {
    item: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    landedAt: null,
    attempts: 2,
    lines: [
      {
        phase: 'review',
        rework: true,
        product: 'codex',
        model: 'model-small',
        requests: 9,
        inputTokens: 120,
        cacheReadTokens: 4000,
        cacheCreationTokens: 0,
        outputTokens: 800,
        costUSD: null,
        costBasis: 'none',
      },
    ],
    totals: { requests: 9, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 9 },
  };

  const parsed: unknown = costToLandSchema.safeParse(cost).data;

  expect(parsed).toStrictEqual(cost);
});

test('it rejects a line whose cost basis the query does not give', () => {
  const cost = { lines: [{ costBasis: 'estimated' }] };

  expect(costToLandSchema.safeParse(cost).error?.issues).toPartiallyContain({
    path: ['lines', 0, 'costBasis'],
  });
});
