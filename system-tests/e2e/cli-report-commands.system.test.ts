import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const totals = z.object({ requests: z.number() });
  const behind = z.object({ facts: z.number() });
  const costSchema = z.object({ item: z.string(), attempts: z.number(), totals, behind });
  const timesSchema = z.object({ item: z.string(), behind });

  const item = await cli.server.dispatch.seedItem({});

  return { ...cli, costSchema, timesSchema, item };
}

test('#cost prints the cost report of the item', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['cost', ctx.item]);

  expect({
    exitCode: result.exitCode,
    report: readJSONOutput(result, ctx.costSchema),
  }).toStrictEqual({
    exitCode: 0,
    report: { item: ctx.item, attempts: 0, totals: { requests: 0 }, behind: { facts: 1 } },
  });
});

test('#cost exits 1 and names the code when the server has no pepys address', async () => {
  const ctx = await createTestCLI({ hasPepys: false });
  const item = await ctx.server.dispatch.seedItem({});
  const result = await ctx.run(['cost', item]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: PEPYS_NOT_CONFIGURED: this boxxy server has no pepys address\n',
  });
});

test('#times prints the stage times of the item', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['times', ctx.item]);

  expect({
    exitCode: result.exitCode,
    report: readJSONOutput(result, ctx.timesSchema),
  }).toStrictEqual({
    exitCode: 0,
    report: { item: ctx.item, behind: { facts: 1 } },
  });
});

test('#times exits 1 when pepys does not answer', async () => {
  const ctx = await setupTest();

  ctx.server.pepys.failNext('connection refused');

  const result = await ctx.run(['times', ctx.item]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: PEPYS_UNAVAILABLE: pepys did not answer {"reason":"connection refused"}\n',
  });
});
