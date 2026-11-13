import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const relation = z.object({ source: z.string(), type: z.string(), target: z.string() });
  const relationsSchema = z.object({ relations: z.array(relation) });

  const blocker = await cli.server.dispatch.seedItem({});
  const blocked = await cli.server.dispatch.seedItem({});

  return { ...cli, relationsSchema, blocker, blocked };
}

test('#relation add adds a relation that #item show lists', async () => {
  const ctx = await setupTest();
  const added = await ctx.run(['relation', 'add', ctx.blocker, 'blocks', ctx.blocked]);
  const shown = await ctx.run(['item', 'show', ctx.blocked]);

  expect(readJSONOutput(added, z.json())).toStrictEqual({ kind: 'added' });

  expect(readJSONOutput(shown, ctx.relationsSchema).relations).toStrictEqual([
    { source: ctx.blocker, type: 'blocks', target: ctx.blocked },
  ]);
});

test('#relation add exits 1 and prints the reason for a relation that closes a cycle', async () => {
  const ctx = await setupTest();

  await ctx.run(['relation', 'add', ctx.blocker, 'blocks', ctx.blocked]);

  const result = await ctx.run(['relation', 'add', ctx.blocked, 'blocks', ctx.blocker]);

  expect({ exitCode: result.exitCode, stdout: readJSONOutput(result, z.json()) }).toStrictEqual({
    exitCode: 1,
    stdout: { kind: 'refused', reason: 'cycle' },
  });
});

test('#relation add exits 2 when <target> is missing', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['relation', 'add', ctx.blocker, 'blocks']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: missing <target>\n',
  });
});

test('#relation remove removes a relation', async () => {
  const ctx = await setupTest();

  await ctx.run(['relation', 'add', ctx.blocker, 'blocks', ctx.blocked]);

  const removed = await ctx.run(['relation', 'remove', ctx.blocker, 'blocks', ctx.blocked]);
  const shown = await ctx.run(['item', 'show', ctx.blocked]);

  expect(readJSONOutput(removed, z.json())).toStrictEqual({ removed: true });
  expect(readJSONOutput(shown, ctx.relationsSchema).relations).toStrictEqual([]);
});
