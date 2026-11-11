import type { GitResult } from './types.ts';

// Runs `git` and waits for it. Output and errors come back as one text.
export async function runGit(args: readonly string[], folder?: string): Promise<GitResult> {
  const child = Bun.spawn(['git', ...args], {
    ...(folder === undefined ? {} : { cwd: folder }),

    // git never waits for a password: a hook has no one to answer
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });

  const [output, errors, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, output: `${output}${errors}` };
}
