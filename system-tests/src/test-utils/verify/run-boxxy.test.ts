import { expect, test } from 'bun:test';
import { z } from 'zod';
import { runBoxxy } from './run-boxxy.ts';
import type { VerifyContext } from './verify-context.ts';

interface ProcessAnswer {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function setupTest(result: ProcessAnswer) {
  const calls: { argv: readonly string[]; stdin: string | undefined }[] = [];

  const ctx: VerifyContext = {
    exec: (argv, options) => {
      calls.push({ argv, stdin: options?.stdin });

      return Promise.resolve(result);
    },
    endpoints: {
      boxxy: 'http://127.0.0.1:4001',
      skills: '/tmp/boxxy-test/skills',
    },
    drivers: {
      http: {
        request: () =>
          Promise.resolve({
            status: 200,
            headers: {},
            body: '{"item":"item-7"}',
            json: { item: 'item-7' },
          }),
      },
    },
  };

  return { ctx, calls };
}

test('#runBoxxy runs the CLI with both URLs and the current item in place of @current', async () => {
  const ctx = setupTest({ exitCode: 0, stdout: '{"item":"item-7"}\n', stderr: '' });

  const output = await runBoxxy(ctx.ctx, {
    argv: ['item', 'show', '@current'],
    schema: z.object({ item: z.string() }),
  });

  const [call] = ctx.calls;

  expect({ output, head: call?.argv.slice(0, 4), tail: call?.argv.slice(-3) }).toStrictEqual({
    output: { item: 'item-7' },
    head: [
      'env',
      'BOXXY_URL=http://127.0.0.1:4001',
      'BOXXY_SKILLS_URL=/tmp/boxxy-test/skills',
      'bun',
    ],
    tail: ['item', 'show', 'item-7'],
  });
});

test('#runBoxxy passes stdin to the CLI', async () => {
  const ctx = setupTest({ exitCode: 0, stdout: '', stderr: '' });

  await runBoxxy(ctx.ctx, { argv: ['hook', 'x'], stdin: '{"a":1}', schema: z.null() });

  expect(ctx.calls.map((call) => call.stdin)).toStrictEqual(['{"a":1}']);
});

test('#runBoxxy reads a plain-text answer as trimmed text', async () => {
  const ctx = setupTest({ exitCode: 0, stdout: 'fact-1\n', stderr: '' });

  const output = await runBoxxy(ctx.ctx, { argv: ['attempt', 'evidence'], schema: z.string() });

  expect(output).toBe('fact-1');
});

test('#runBoxxy fails with check-failed and the CLI stderr on a non-zero exit', async () => {
  const ctx = setupTest({ exitCode: 1, stdout: '', stderr: 'error: NOT_FOUND\n' });
  const failure = runBoxxy(ctx.ctx, { argv: ['cost', 'x'], schema: z.unknown() });

  await expect(failure).rejects.toMatchObject({
    code: 'check-failed',
    message: 'boxxy cost x exited 1: error: NOT_FOUND',
  });
});
