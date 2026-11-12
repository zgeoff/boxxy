import { join } from 'node:path';
import { WringerError, findOwnValue } from '@wringer/core';
import type { z } from 'zod';
import { controlRoutes } from './harness/control-routes.ts';
import { postControl } from './post-control.ts';
import type { VerifyContext } from './verify-context.ts';

export interface BoxxyRun<Output> {
  readonly argv: readonly string[];
  readonly stdin?: string;
  readonly schema: z.ZodType<Output>;
}

const cliPath = join(import.meta.dir, '..', '..', '..', '..', 'apps', 'cli', 'src', 'main.ts');

// Runs the real CLI as a process, with BOXXY_URL set to the harness's `boxxy` listener, and
// replaces the word `@current` with the current item. It sets BOXXY_SKILLS_URL on every call,
// because the session-start hook fetches from GitHub when the variable is unset.
export async function runBoxxy<Output>(ctx: VerifyContext, run: BoxxyRun<Output>): Promise<Output> {
  const argv = await replaceCurrent(ctx, run.argv);

  const stdinOptions = run.stdin === undefined ? {} : { stdin: run.stdin };

  const result = await ctx.exec(
    [
      'env',
      `BOXXY_URL=${readEndpoint(ctx, 'boxxy')}`,
      `BOXXY_SKILLS_URL=${readEndpoint(ctx, 'skills')}`,
      'bun',
      cliPath,
      ...argv,
    ],
    stdinOptions,
  );

  if (result.exitCode !== 0) {
    throw new WringerError('check-failed', {
      message: `boxxy ${argv.join(' ')} exited ${result.exitCode}: ${result.stderr.trim()}`,
    });
  }

  const output: unknown = result.stdout.trim() === '' ? null : parseOutput(result.stdout);

  return run.schema.parse(output);
}

async function replaceCurrent(
  ctx: VerifyContext,
  argv: readonly string[],
): Promise<readonly string[]> {
  if (!argv.includes('@current')) {
    return argv;
  }

  const current = await postControl(ctx, controlRoutes.readCurrent, null);

  return argv.map((word) => (word === '@current' ? current.item : word));
}

function readEndpoint(ctx: VerifyContext, name: string): string {
  const value = findOwnValue(ctx.endpoints, name);

  if (value === undefined) {
    throw new WringerError('environment', { message: `the harness has no ${name} endpoint` });
  }

  return value;
}

// the CLI prints JSON, or plain text for a hook that answers a line
function parseOutput(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}
