import { expect, onTestFinished, test } from 'bun:test';
import { createFactBatchSender } from '@pepys/kit/send';
import { boxxySource } from '../boxxy-source.ts';
import { buildMockItemFacts } from './build-mock-item-facts.ts';
import { createRealPepys } from './create-real-pepys.ts';

async function setupTest() {
  const pepys = await createRealPepys({
    boxxySecret: 'a-boxxy-secret',
    webhookSecret: 'a-webhook-secret',
  });

  onTestFinished(() => pepys[Symbol.asyncDispose]());

  const makeSend = (secret: string) =>
    createFactBatchSender({
      source: boxxySource,
      url: 'http://pepys.test/boxxy/facts',
      secret,
      fetch: pepys.handleRequest,
    });

  return { pepys, makeSend };
}

test('it answers the cost query from the facts of a signed batch that ingest stored', async () => {
  const ctx = await setupTest();

  await ctx.makeSend('a-boxxy-secret')(buildMockItemFacts().applied);

  const cost = await ctx.pepys.client.boxxy_cost_to_land({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect(cost).toStrictEqual(expect.objectContaining({ attempts: 5, landedAt: null }));
});

test('it refuses a batch signed with another secret with 401', async () => {
  const ctx = await setupTest();
  const answer = await ctx.makeSend('another-secret')(buildMockItemFacts().applied);

  expect(answer).toStrictEqual({
    ok: false,
    failure: { kind: 'refused', status: 401, reason: expect.any(String) },
  });
});
