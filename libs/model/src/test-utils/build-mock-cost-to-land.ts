import { faker } from '@faker-js/faker';
import type { CostToLand } from '../reports/types.ts';

// The cost of a landed item: one build line with a reported cost.
export function buildMockCostToLand(overrides: Partial<CostToLand> = {}): CostToLand {
  const costUSD = faker.number.float({ min: 0.5, max: 20, fractionDigits: 2 });
  const requests = faker.number.int({ min: 1, max: 80 });

  return {
    item: `boxxy:item:${faker.string.uuid({ version: 7 })}`,
    landedAt: '2026-11-11T06:00:00Z',
    attempts: 1,
    lines: [
      {
        phase: 'build',
        rework: false,
        product: 'claude_code',
        model: 'model-large',
        requests,
        inputTokens: requests * 10,
        cacheReadTokens: requests * 1000,
        cacheCreationTokens: requests * 50,
        outputTokens: requests * 300,
        costUSD,
        costBasis: 'reported',
      },
    ],
    totals: { requests, costUSD, reworkCostUSD: 0, requestsWithoutCost: 0 },
    ...overrides,
  };
}
