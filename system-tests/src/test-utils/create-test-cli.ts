import { readFile } from 'node:fs/promises';
import { runCLI, runGit } from '@boxxy/cli';
import type { CLIDeps, CLIResult } from '@boxxy/cli';
import type { TestServer, TestServerOptions } from '@boxxy/server/test-utils/create-test-server';
import { createTestServer } from '@boxxy/server/test-utils/create-test-server';
import { makeBrokerSend } from './make-broker-send.ts';

interface RunInput {
  readonly stdin?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface TestCLI {
  readonly server: TestServer;

  // the milliseconds the CLI asked to sleep, in order; the sleeps return at once
  readonly slept: readonly number[];
  readonly run: (argv: readonly string[], input?: RunInput) => Promise<CLIResult>;
}

// The CLI wired to the real server on the memory store, behind the broker routing.
export async function createTestCLI(options: TestServerOptions = {}): Promise<TestCLI> {
  const server = await createTestServer(options);

  const slept: number[] = [];
  const send = makeBrokerSend(server);

  return {
    server,
    slept,
    run: (argv, input = {}) => {
      const deps: CLIDeps = {
        env: { BOXXY_URL: 'http://boxxy.test', ...input.env },
        send,
        readStdin: () => Promise.resolve(input.stdin ?? ''),
        readFile: (path) => readFile(path, 'utf8'),
        runGit,
        sleep: (durationMs) => {
          slept.push(durationMs);

          return Promise.resolve();
        },
        now: () => Date.parse('2026-11-01T09:00:00Z'),
      };

      return runCLI(deps, argv);
    },
  };
}
