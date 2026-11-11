import { expect, onTestFinished, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createFactBatchSender } from '@pepys/kit/send';
import { boxxySource } from '../boxxy-source.ts';
import { buildMockItemFacts } from './build-mock-item-facts.ts';
import { createTestPepys } from './create-test-pepys.ts';

async function setupTest() {
  const pepys = await createTestPepys({
    boxxySecret: 'a-boxxy-secret',
    webhookSecret: 'a-webhook-secret',
  });

  onTestFinished(() => pepys[Symbol.asyncDispose]());

  const send = createFactBatchSender({
    source: boxxySource,
    url: 'http://pepys.test/boxxy/facts',
    secret: 'a-boxxy-secret',
    fetch: pepys.handleRequest,
  });

  const sendWebhook = (body: string, secret: string) =>
    pepys.handleRequest(
      new Request('http://pepys.test/webhook/github', {
        method: 'POST',
        headers: {
          'x-github-event': 'pull_request',
          'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
        },
        body,
      }),
    );

  return { pepys, send, sendWebhook };
}

test('it answers the cost query from the facts of a signed batch', async () => {
  const ctx = await setupTest();

  await ctx.send(buildMockItemFacts().applied);

  const cost = await ctx.pepys.client.boxxy_cost_to_land({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect(cost).toMatchObject({ attempts: 5, landedAt: null });
});

test('it refuses a batch signed with another secret with 401', async () => {
  const ctx = await setupTest();

  const send = createFactBatchSender({
    source: boxxySource,
    url: 'http://pepys.test/boxxy/facts',
    secret: 'another-secret',
    fetch: ctx.pepys.handleRequest,
  });

  const answer = await send(buildMockItemFacts().applied);

  expect(answer).toStrictEqual({
    ok: false,
    failure: { kind: 'refused', status: 401, reason: expect.any(String) },
  });
});

test('it reads the merge of a signed webhook through the produced link', async () => {
  const ctx = await setupTest();

  await ctx.send(buildMockItemFacts().applied);

  await ctx.sendWebhook(
    JSON.stringify({
      action: 'closed',
      pull_request: { id: 9001, merged_at: '2026-11-11T05:00:00Z' },
    }),
    'a-webhook-secret',
  );

  const stages = await ctx.pepys.client.boxxy_stage_time({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
  });

  const cost = await ctx.pepys.client.boxxy_cost_to_land({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect({ stages, cost }).toMatchObject({
    stages: {
      steps: expect.arrayContaining([
        { step: 'merge', minutes: 30, endedAt: '2026-11-11T05:00:00Z' },
      ]),
    },
    cost: { landedAt: '2026-11-11T05:00:00Z' },
  });
});

test('it refuses a webhook signed with another secret with 401 and records no merge', async () => {
  const ctx = await setupTest();

  await ctx.send(buildMockItemFacts().applied);

  const answer = await ctx.sendWebhook(
    JSON.stringify({
      action: 'closed',
      pull_request: { id: 9001, merged_at: '2026-11-11T05:00Z' },
    }),
    'another-secret',
  );

  const cost = await ctx.pepys.client.boxxy_cost_to_land({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect({ status: answer.status, cost }).toMatchObject({
    status: 401,
    cost: { landedAt: null },
  });
});

test('it counts a telemetry request whose origin is the caller of the session', async () => {
  const ctx = await setupTest();

  await ctx.send(buildMockItemFacts().applied);

  await ctx.pepys.writeTelemetry([
    {
      id: 'r1',
      session: 's-build',
      origin: { issuer: 'https://broker.example', subject: 'imp-builder' },
      model: 'model-large',
      costUSD: 1.5,
      inputTokens: 100,
      outputTokens: 400,
      at: '2026-11-11T02:20:00Z',
    },
  ]);

  const cost = await ctx.pepys.client.boxxy_cost_to_land({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect(cost).toMatchObject({ totals: { requests: 1, costUSD: 1.5 } });
});
