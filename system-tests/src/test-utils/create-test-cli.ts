import { readFile } from 'node:fs/promises';
import { runCLI, runGit } from '@boxxy/cli';
import type { CLIDeps, CLIResult } from '@boxxy/cli';
import { access } from '@boxxy/contract';
import type { ProcedureName } from '@boxxy/contract';
import type { TestServer, TestServerOptions } from '@boxxy/server/test-utils/create-test-server';
import { createTestServer } from '@boxxy/server/test-utils/create-test-server';

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

// The CLI wired to the real server on the memory store. The CLI sends no token, so this stands in
// for the broker: a request for a session or hook procedure goes to the worker listener with the
// worker token, and any other request goes to the owner listener.
export async function createTestCLI(options: TestServerOptions = {}): Promise<TestCLI> {
  const server = await createTestServer(options);

  const slept: number[] = [];

  const send = (request: Request): Promise<Response> => {
    const procedure = readProcedure(request);

    if (procedure === null || access[procedure].caller === 'owner') {
      return server.owner(request);
    }

    const headers = new Headers(request.headers);

    headers.set('authorization', `Bearer ${server.workerToken}`);

    return server.worker(new Request(request, { headers }));
  };

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

function readProcedure(request: Request): ProcedureName | null {
  const name = new URL(request.url).pathname.replace(/^\/rpc\//u, '').replaceAll('/', '.');

  return (
    Object.keys(access).find((candidate): candidate is ProcedureName => candidate === name) ?? null
  );
}
