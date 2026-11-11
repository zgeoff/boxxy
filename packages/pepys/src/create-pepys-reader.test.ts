import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { pepysReaderContract } from '@boxxy/model/test-utils/pepys-reader-contract';
import { createTestStore } from '@pepys/testing';
import { boxxySource } from './boxxy-source.ts';
import { buildBoxxyPlugin } from './build-boxxy-plugin.ts';
import { createPepysReader } from './create-pepys-reader.ts';
import { buildCostToLandQuery } from './queries/build-cost-to-land-query.ts';
import { buildStageTimeQuery } from './queries/build-stage-time-query.ts';
import { buildForeignStandIn } from './test-utils/build-foreign-stand-in.ts';
import { buildMockItemFacts } from './test-utils/build-mock-item-facts.ts';
import { createQueryStandIn } from './test-utils/create-query-stand-in.ts';
import type { BoxxyQueryClient } from './types.ts';

function setupTest() {
  const queries = createQueryStandIn();

  return {
    harness: {
      reader: createPepysReader({
        client: queries.client,
        environment: 'staging',
        timeoutMs: 10_000,
      }),
      environment: 'staging',
      writeCost: (item: string, cost: Parameters<typeof queries.setCost>[1]) => {
        queries.setCost(`boxxy:item:${item}`, cost);

        return Promise.resolve();
      },
      takeDown: () => {
        queries.takeDown();

        return Promise.resolve();
      },
    },
  };
}

test.each(pepysReaderContract)('it keeps the PepysReader contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check(ctx.harness);

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it reads the stage times of an item through the queries of the plug-in', async () => {
  const standIn = buildForeignStandIn();
  const item = brandSchemas.itemId.parse('0193a1b2-0000-7000-8000-000000000001');

  await using store = await createTestStore({
    plugins: [buildBoxxyPlugin(standIn.foreign), ...standIn.plugins],
  });

  const client: BoxxyQueryClient = {
    boxxy_cost_to_land: (input) => store.query(buildCostToLandQuery(standIn.foreign), input),
    boxxy_stage_time: (input) => store.query(buildStageTimeQuery(standIn.foreign.delivery), input),
  };

  await store.apply(boxxySource, buildMockItemFacts().applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  const reader = createPepysReader({ client, environment: 'production', timeoutMs: 10_000 });

  const answer = await reader.readStageTime(item);

  expect(answer).toStrictEqual({
    kind: 'value',
    value: expect.objectContaining({ item: `boxxy:item:${item}`, sleepMinutes: 20 }),
  });
});

test('it answers unavailable for an answer that the report schema refuses', async () => {
  const item = brandSchemas.itemId.parse('0193a1b2-0000-7000-8000-000000000001');

  const reader = createPepysReader({
    client: {
      boxxy_cost_to_land: () => Promise.resolve({ item: 'boxxy:item:x', lines: 'none' }),
      boxxy_stage_time: () => Promise.resolve({}),
    },
    environment: 'production',
    timeoutMs: 10_000,
  });

  const answer = await reader.readCostToLand(item);

  expect(answer).toStrictEqual({
    kind: 'unavailable',
    reason: 'pepys answered a shape this boxxy does not know',
  });
});

test('it answers unavailable when pepys gives no answer in the time limit', async () => {
  const item = brandSchemas.itemId.parse('0193a1b2-0000-7000-8000-000000000001');
  const never = Promise.withResolvers<unknown>();

  const reader = createPepysReader({
    client: { boxxy_cost_to_land: () => never.promise, boxxy_stage_time: () => never.promise },
    environment: 'production',
    timeoutMs: 5,
  });

  const answer = await reader.readStageTime(item);

  expect(answer).toStrictEqual({ kind: 'unavailable', reason: 'no answer in 5 ms' });
});

test('it asks each query for the entity ID of the item, and the stage times for its environment', async () => {
  const item = brandSchemas.itemId.parse('0193a1b2-0000-7000-8000-000000000001');
  const inputs: unknown[] = [];

  const reader = createPepysReader({
    client: {
      boxxy_cost_to_land: (input) => {
        inputs.push(input);

        return Promise.reject(new Error('stop'));
      },
      boxxy_stage_time: (input) => {
        inputs.push(input);

        return Promise.reject(new Error('stop'));
      },
    },
    environment: 'production',
    timeoutMs: 10_000,
  });

  await reader.readCostToLand(item);
  await reader.readStageTime(item);

  expect(inputs).toStrictEqual([
    { item: `boxxy:item:${item}` },
    { item: `boxxy:item:${item}`, environment: 'production' },
  ]);
});
