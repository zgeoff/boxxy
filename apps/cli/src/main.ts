#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { runCLI } from './cli/run-cli.ts';
import { runGit } from './run-git.ts';

// The entry of the `boxxy` command: the real environment, stdin, files and git, given to `runCLI`.
const result = await runCLI(
  {
    env: process.env,
    readStdin: () => Bun.stdin.text(),
    readFile: (path) => readFile(path, 'utf8'),
    runGit,
    sleep: (durationMs) => Bun.sleep(durationMs),
    now: () => Date.now(),
  },
  process.argv.slice(2),
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.exitCode);
