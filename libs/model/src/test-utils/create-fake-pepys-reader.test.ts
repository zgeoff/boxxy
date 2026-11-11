import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockCostToLand } from './build-mock-cost-to-land.ts';
import { createFakePepysReader } from './create-fake-pepys-reader.ts';
import { pepysReaderContract } from './pepys-reader-contract.ts';

function setupTest() {
  const fake = createFakePepysReader('production');

  return {
    fake,
    harness: {
      reader: fake,
      environment: 'production',
      writeCost: (
        item: Parameters<typeof fake.set>[0],
        cost: ReturnType<typeof buildMockCostToLand>,
      ) => {
        fake.set(item, { cost });

        return Promise.resolve();
      },
      takeDown: () => {
        fake.failNext('connection refused');
        fake.failNext('connection refused');

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

test('#failNext fails the next call with its reason, and the call after answers again', async () => {
  const ctx = setupTest();
  const item = brandSchemas.itemId.parse('0193a1b2-0000-7000-8000-000000000001');
  const cost = buildMockCostToLand({ item: `boxxy:item:${item}` });

  ctx.fake.set(item, { cost });
  ctx.fake.failNext('connection refused');

  const first = await ctx.fake.readCostToLand(item);
  const second = await ctx.fake.readCostToLand(item);

  expect([first, second]).toStrictEqual([
    { kind: 'unavailable', reason: 'connection refused' },
    { kind: 'value', value: cost },
  ]);
});
