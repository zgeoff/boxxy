import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const attemptRef = z.object({ id: z.string() });
  const closeOutShape = z.object({ phase: z.string(), outcomes: z.array(z.string()) });
  const listedRef = z.object({ id: z.string() });
  const listedSchema = z.object({ kind: z.string(), items: z.array(listedRef) });

  const currentSchema = z.object({
    kind: z.string(),
    attempt: attemptRef,
    closeOut: closeOutShape,
  });

  const designed = {
    kind: 'designed',
    design: { text: 'Follow the system theme.', location: null },
  };

  const designBody = JSON.stringify({ result: designed, friction: [] });

  const attempt = await cli.server.seedStartedAttempt(brandSchemas.phaseName.parse('design'));

  cli.server.callerProof.setCaller(attempt.caller);

  return { ...cli, currentSchema, listedSchema, designBody, attempt };
}

test('#attempt current prints the attempt of the calling session and the close-out it takes', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'current']);

  const current = readJSONOutput(result, ctx.currentSchema);

  expect([result.exitCode, current.attempt.id, current.closeOut.phase]).toStrictEqual([
    0,
    ctx.attempt.id,
    'design',
  ]);
});

test('#attempt current exits 2 and says to try again when no session holds the caller', async () => {
  const ctx = await setupTest();

  ctx.server.callerProof.setCaller({ issuer: 'fake-worker', subject: 'another-machine' });

  const result = await ctx.run(['attempt', 'current']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'no attempt for this session yet; try again in 5 seconds\n',
  });
});

test('#attempt current exits 1 when the caller cannot be proven', async () => {
  const ctx = await setupTest();

  ctx.server.callerProof.setCaller(null);

  const result = await ctx.run(['attempt', 'current']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'error: UNAUTHORIZED: Unauthorized\n',
  });
});

test('#attempt close-out records the close-out from stdin and prints its fact ID', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });
  const [fact] = await ctx.server.dispatch.listFacts('boxxy.attempt.closed_out');

  expect({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }).toStrictEqual(
    {
      exitCode: 0,
      stdout: `${fact?.factId}\n`,
      stderr: '',
    },
  );
});

test('#attempt close-out prints the same fact ID when the same body arrives again', async () => {
  const ctx = await setupTest();
  const first = await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });
  const repeat = await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });

  expect(repeat).toStrictEqual(first);
});

test('#attempt close-out exits 1 and lists every problem for a body the schema rejects', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'close-out'], { stdin: '{"friction":"none"}' });

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: '',
  });

  expect(result.stderr.split('\n').filter((line) => line !== '').length).toBeGreaterThan(0);
});

test('#attempt close-out exits 1 for a different body after the first valid one', async () => {
  const ctx = await setupTest();

  await ctx.run(['attempt', 'close-out'], { stdin: ctx.designBody });

  const result = await ctx.run(['attempt', 'close-out'], {
    stdin: JSON.stringify({
      result: { kind: 'designed', design: { text: 'Another design.', location: null } },
      friction: [],
    }),
  });

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: 'this attempt already has a close-out, and the first valid close-out is final\n',
  });
});

test('#attempt close-out exits 2 and sends nothing when stdin is not JSON', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'close-out'], { stdin: 'not json' });
  const facts = await ctx.server.dispatch.listFacts('boxxy.attempt.closed_out');

  expect({ exitCode: result.exitCode, stderr: result.stderr, facts }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: stdin is not JSON\n',
    facts: [],
  });
});

test('#attempt evidence records one piece of evidence and prints its ID', async () => {
  const ctx = await setupTest();

  const result = await ctx.run([
    'attempt',
    'evidence',
    '--kind',
    'test',
    '--ref',
    'theme.test.ts: follows the system',
    '--observed',
    '42 passed',
  ]);

  const [fact] = await ctx.server.dispatch.listFacts('boxxy.evidence.recorded');

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: `${fact?.factId}\n`,
  });
});

test('#attempt evidence exits 2 for a kind that does not exist', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['attempt', 'evidence', '--kind', 'hunch', '--ref', 'a feeling']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: --kind takes one of: test, ci-run, live-check\n',
  });
});

test('#attempt list-items prints the items of the repo of the session that hold the text', async () => {
  const ctx = await setupTest();

  const filed = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/app',
    '--title',
    'Add a theme toggle',
    '--outcome',
    'The header has a theme toggle.',
  ]);

  const toggle = readJSONOutput(filed, z.object({ item: z.string() })).item;

  const result = await ctx.run(['attempt', 'list-items', '--text', 'toggle']);

  const listed = readJSONOutput(result, ctx.listedSchema);

  expect({ exitCode: result.exitCode, listed }).toStrictEqual({
    exitCode: 0,
    listed: { kind: 'items', items: [{ id: toggle }] },
  });
});

test('#attempt show-item exits 1 with NOT_FOUND for a held item', async () => {
  const ctx = await setupTest();

  const filed = await ctx.run([
    'item',
    'file',
    '--repo',
    'example/app',
    '--title',
    'Draft a new palette',
    '--outcome',
    'The palette is chosen.',
    '--held',
    'still a draft',
  ]);

  const draft = readJSONOutput(filed, z.object({ item: z.string() })).item;

  const result = await ctx.run(['attempt', 'show-item', draft]);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: `error: NOT_FOUND: no such item {"item":"${draft}"}\n`,
  });
});
