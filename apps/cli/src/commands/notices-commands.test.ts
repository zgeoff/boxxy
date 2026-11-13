import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestCLI } from '../test-utils/create-test-cli.ts';
import { readJSONOutput } from '../test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const sessionSchema = z.object({
    session: z.object({ gatewayID: z.string(), setAt: z.string() }).nullable(),
  });

  return { ...cli, sessionSchema };
}

test('#notices show prints a null session before any is registered', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['notices', 'show']);

  expect({
    exitCode: result.exitCode,
    stdout: readJSONOutput(result, ctx.sessionSchema),
  }).toStrictEqual({ exitCode: 0, stdout: { session: null } });
});

test('#notices register sets the session that #notices show prints', async () => {
  const ctx = await setupTest();

  const setAt = new Date(ctx.server.dispatch.clock.now()).toISOString();

  const registered = await ctx.run(['notices', 'register', 'desk.3.s7']);
  const shown = await ctx.run(['notices', 'show']);

  expect({
    exitCode: registered.exitCode,
    stdout: readJSONOutput(registered, ctx.sessionSchema),
  }).toStrictEqual({ exitCode: 0, stdout: { session: { gatewayID: 'desk.3.s7', setAt } } });

  expect(readJSONOutput(shown, ctx.sessionSchema)).toStrictEqual({
    session: { gatewayID: 'desk.3.s7', setAt },
  });
});

test('#notices register exits 2 when <gateway-id> is missing', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['notices', 'register']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: missing <gateway-id>\n',
  });
});

test('#notices register exits with an error for a name that is no gateway ID, and registers nothing', async () => {
  const ctx = await setupTest();
  const refused = await ctx.run(['notices', 'register', 'owner-desk']);
  const shown = await ctx.run(['notices', 'show']);

  expect(refused.exitCode).not.toBe(0);
  expect(readJSONOutput(shown, ctx.sessionSchema)).toStrictEqual({ session: null });
});
