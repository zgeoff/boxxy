import { expect, test } from 'bun:test';
import { costToLandSchema } from '../reports/cost-to-land-schema.ts';
import { buildMockCostToLand } from './build-mock-cost-to-land.ts';

test('it builds a cost that the cost schema accepts', () => {
  expect(costToLandSchema.safeParse(buildMockCostToLand()).success).toBe(true);
});

test('it keeps an override', () => {
  expect(buildMockCostToLand({ landedAt: null }).landedAt).toBeNull();
});
