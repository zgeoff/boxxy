import { z } from 'zod';
import { costBases } from './constants.ts';

const tokenCountSchema = z.number().int();

const costLineSchema = z.object({
  phase: z.string(),

  // the attempt's round is above 1
  rework: z.boolean(),
  product: z.string(),

  // null only on a `turn` line whose record carried no model
  model: z.string().nullable(),
  requests: tokenCountSchema,
  inputTokens: tokenCountSchema,
  cacheReadTokens: tokenCountSchema,
  cacheCreationTokens: tokenCountSchema,
  outputTokens: tokenCountSchema,

  // null: not known, never 0
  costUSD: z.number().nullable(),
  costBasis: z.enum(costBases),
});

const totalsSchema = z.object({
  requests: tokenCountSchema,

  // the sum of the lines that have a cost
  costUSD: z.number(),
  reworkCostUSD: z.number(),

  // requests whose cost no table holds; above 0, `costUSD` is a lower bound
  requestsWithoutCost: tokenCountSchema,
});

// The output of the pepys query `boxxy_cost_to_land`: a plain object with no transform, as the
// query kit asks of an output.
export const costToLandSchema = z.object({
  item: z.string(),

  // the earliest merge of a pull request the item's attempts produced; null: not landed yet
  landedAt: z.string().nullable(),
  attempts: tokenCountSchema,
  lines: z.array(costLineSchema),
  totals: totalsSchema,
});
