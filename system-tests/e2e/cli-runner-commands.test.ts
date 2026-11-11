import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const outbox = z.object({ sink: z.string() });
  const statusSchema = z.object({ paused: z.boolean(), outbox });
  const dryRunSchema = z.object({ kind: z.string(), moved: z.number() });
  const rejectedSchema = z.object({ kind: z.string() });

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-cli-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  return { ...cli, statusSchema, dryRunSchema, rejectedSchema, folder };
}

test('#status prints the runner state', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['status']);

  expect({
    exitCode: result.exitCode,
    status: readJSONOutput(result, ctx.statusSchema),
  }).toStrictEqual({
    exitCode: 0,
    status: { paused: false, outbox: { sink: 'none' } },
  });
});

test('#runner pause pauses the runner and #runner resume resumes it', async () => {
  const ctx = await setupTest();
  const paused = await ctx.run(['runner', 'pause']);
  const whilePaused = await ctx.run(['status']);
  const resumed = await ctx.run(['runner', 'resume']);

  expect([
    readJSONOutput(paused, z.json()),
    readJSONOutput(whilePaused, ctx.statusSchema).paused,
    readJSONOutput(resumed, z.json()),
  ]).toStrictEqual([{ paused: true }, true, { paused: false }]);
});

test('#outbox retry reports how many rows it unparked', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['outbox', 'retry']);

  expect(readJSONOutput(result, z.json())).toStrictEqual({ unparked: 0 });
});

test('#rules dry-run loads the file and reports that no item moved', async () => {
  const ctx = await setupTest();

  const file = join(ctx.folder, 'rules.yaml');
  const text = buildExampleLoadInput().checkout.files.get('rules.yaml');

  await writeFile(file, text ?? '');

  await ctx.server.dispatch.seedItem({});

  const result = await ctx.run(['rules', 'dry-run', file]);

  expect(readJSONOutput(result, ctx.dryRunSchema)).toStrictEqual({
    kind: 'loaded',
    moved: 0,
  });
});

test('#rules dry-run exits 1 and prints the rejections for a file that does not load', async () => {
  const ctx = await setupTest();

  const file = join(ctx.folder, 'rules.yaml');

  await writeFile(file, 'pools: nonsense');

  const result = await ctx.run(['rules', 'dry-run', file]);

  const rejected = readJSONOutput(result, ctx.rejectedSchema);

  expect([result.exitCode, rejected]).toStrictEqual([1, { kind: 'rejected' }]);
});

test('#rules dry-run exits 1 and names the file it cannot read', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['rules', 'dry-run', join(ctx.folder, 'missing.yaml')]);

  expect(result.exitCode).toBe(1);
});
