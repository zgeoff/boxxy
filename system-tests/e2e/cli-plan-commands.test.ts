import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const leverSchema = z.object({ lever: z.number() });
  const leversSchema = z.object({ levers: z.array(z.number()) });

  const first = await cli.server.dispatch.seedItem({});
  const second = await cli.server.dispatch.seedItem({});

  return { ...cli, leverSchema, leversSchema, first, second };
}

test('#defer records a lever and #undefer records the next one', async () => {
  const ctx = await setupTest();

  const deferred = await ctx.run([
    'defer',
    ctx.first,
    '--until',
    '2026-12-01T09:00:00Z',
    '--reason',
    'waits for the schema freeze to lift',
  ]);

  const undeferred = await ctx.run(['undefer', ctx.first]);

  expect([
    deferred.exitCode,
    readJSONOutput(deferred, ctx.leverSchema),
    undeferred.exitCode,
    readJSONOutput(undeferred, ctx.leverSchema),
  ]).toStrictEqual([0, { lever: 1 }, 0, { lever: 2 }]);
});

test('#defer exits 2 and records nothing when --reason is missing', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['defer', ctx.first]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: missing --reason\n',
  });
});

test('#defer exits 1 when the server refuses the time', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['defer', ctx.first, '--until', 'tomorrow', '--reason', 'later']);

  expect(result.exitCode).toBe(1);
});

test('#expedite puts every item given at the front and #unexpedite ends one', async () => {
  const ctx = await setupTest();

  const expedited = await ctx.run([
    'expedite',
    ctx.second,
    ctx.first,
    '--reason',
    'release blocker',
  ]);

  const unexpedited = await ctx.run(['unexpedite', ctx.second]);

  expect([
    readJSONOutput(expedited, ctx.leversSchema).levers.length,
    readJSONOutput(unexpedited, ctx.leverSchema),
  ]).toStrictEqual([2, { lever: 3 }]);
});

test('#expedite exits 2 when no item is given', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['expedite', '--reason', 'release blocker']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: missing <item>\n',
  });
});
