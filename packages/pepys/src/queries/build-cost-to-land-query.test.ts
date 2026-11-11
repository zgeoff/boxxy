import { expect, onTestFinished, test } from 'bun:test';
import { createTestStore } from '@pepys/testing';
import { boxxySource } from '../boxxy-source.ts';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import { buildForeignStandIn } from '../test-utils/build-foreign-stand-in.ts';
import { buildMockItemFacts } from '../test-utils/build-mock-item-facts.ts';
import { toEntityID } from '../test-utils/to-entity-id.ts';
import { buildCostToLandQuery } from './build-cost-to-land-query.ts';

async function setupTest() {
  const standIn = buildForeignStandIn();
  const query = buildCostToLandQuery(standIn.foreign);

  const store = await createTestStore({
    plugins: [buildBoxxyPlugin(standIn.foreign), ...standIn.plugins],
  });

  onTestFinished(() => store[Symbol.asyncDispose]());

  return { store, query, consumers: standIn.consumers };
}

test('it answers the cost of each phase from the telemetry rows that the attempts own', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();
  const caller = { origin_issuer: 'https://broker.example', origin_subject: 'imp-builder' };

  const tokens = {
    input_tokens: 100,
    cache_read_tokens: 2000,
    cache_creation_tokens: 300,
    output_tokens: 400,
  };

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  await ctx.store.writeRows(ctx.consumers.telemetryModelRequest, 'telemetry_model_request', [
    {
      id: toEntityID('telemetry:model_request:r1'),
      session_id: toEntityID('telemetry:session:s-build'),
      ...caller,
      product: 'claude_code',
      model: 'model-large',
      cost_basis: 'reported',
      cost_usd: 1.5,
      ...tokens,
      at: '2026-11-11T02:20:00Z',
    },
    {
      id: toEntityID('telemetry:model_request:r2'),
      session_id: toEntityID('telemetry:session:s-build'),
      ...caller,
      product: 'claude_code',
      model: 'model-large',
      cost_basis: 'reported',
      cost_usd: 0.5,
      ...tokens,
      at: '2026-11-11T03:50:00Z',
    },
    {
      id: toEntityID('telemetry:model_request:r3'),
      session_id: toEntityID('telemetry:session:s-build'),
      origin_issuer: 'https://broker.example',
      origin_subject: 'imp-other',
      product: 'claude_code',
      model: 'model-large',
      cost_basis: 'reported',
      cost_usd: 9,
      ...tokens,
      at: '2026-11-11T02:21:00Z',
    },
  ]);

  await ctx.store.writeRows(ctx.consumers.telemetryTurnCost, 'telemetry_turn_cost', [
    {
      id: toEntityID('telemetry:turn_cost:t1'),
      session_id: toEntityID('telemetry:session:s-review'),
      ...caller,
      product: 'codex',
      model: null,
      cost_usd: 0.25,
      at: '2026-11-11T03:20:00Z',
    },
  ]);

  await ctx.store.writeRows(ctx.consumers.githubPullRequest, 'github_pull_request', [
    { id: toEntityID('github:pull_request:9001'), merged_at: '2026-11-11T05:00:00Z' },
  ]);

  const cost = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  const requestLine = {
    product: 'claude_code',
    model: 'model-large',
    requests: 1,
    inputTokens: 100,
    cacheReadTokens: 2000,
    cacheCreationTokens: 300,
    outputTokens: 400,
    costBasis: 'reported',
  } as const;

  expect(cost).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    landedAt: '2026-11-11T05:00:00Z',
    attempts: 5,
    lines: [
      { phase: 'build', rework: false, ...requestLine, costUSD: 1.5 },
      { phase: 'build', rework: true, ...requestLine, costUSD: 0.5 },
      {
        phase: 'review',
        rework: false,
        product: 'codex',
        model: null,
        requests: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        costUSD: 0.25,
        costBasis: 'turn',
      },
    ],
    totals: { requests: 2, costUSD: 2.25, reworkCostUSD: 0.5, requestsWithoutCost: 0 },
  });
});

test('it answers no attempts and no lines for an item with no rows', async () => {
  const ctx = await setupTest();

  const cost = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000009',
  });

  expect(cost).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000009',
    landedAt: null,
    attempts: 0,
    lines: [],
    totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
  });
});

test('it answers no attempts for an input that names no boxxy item', async () => {
  const ctx = await setupTest();
  const cost = await ctx.store.query(ctx.query, { item: 'github:pull_request:9001' });

  expect(cost.attempts).toBe(0);
});
