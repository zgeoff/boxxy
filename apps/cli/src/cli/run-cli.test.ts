import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildMockCLIDeps } from '../test-utils/build-mock-cli-deps.ts';
import { runCLI } from './run-cli.ts';

interface Reply {
  // the `json` member of the RPC response
  readonly json: unknown;
  readonly status: number;
}

// The CLI with a fake `fetch`: every request is kept, and every one gets `reply`.
function setupTest(reply: Reply, baseURL: string) {
  const requests: { url: string; method: string; headers: string[]; body: unknown }[] = [];

  const send = async (request: Request): Promise<Response> => {
    requests.push({
      url: request.url,
      method: request.method,
      headers: [...request.headers.keys()].filter((name) => name !== 'content-type'),
      body: await request.json(),
    });

    return Response.json({ json: reply.json }, { status: reply.status });
  };

  return {
    requests,
    run: (argv: readonly string[]) =>
      runCLI({ ...buildMockCLIDeps({ BOXXY_URL: baseURL }), send }, argv),
  };
}

test('it prints the usage of every command and exits 0 for no arguments', async () => {
  const result = await runCLI(buildMockCLIDeps({}), []);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('boxxy item file --repo --title --outcome');
  expect(result.stdout).toContain('boxxy hook session-start');
});

test('it prints only the commands of a group for the group name', async () => {
  const result = await runCLI(buildMockCLIDeps({}), ['relation']);

  expect(result.stdout).toContain('boxxy relation add <source> <type> <target>');
  expect(result.stdout).not.toContain('boxxy item file');
});

test('it prints the usage of one command for --help after its name', async () => {
  const result = await runCLI(buildMockCLIDeps({}), ['item', 'close', '--help']);

  expect(result.stdout).toContain('boxxy item close <item> --reason [--of]');
});

test('it prints the version of the package and exits 0 for --version', async () => {
  const manifestText = await Bun.file(new URL('../../package.json', import.meta.url)).text();

  const manifest = z.object({ version: z.string() }).parse(JSON.parse(manifestText));

  const result = await runCLI(buildMockCLIDeps({}), ['--version']);

  expect(result).toStrictEqual({ exitCode: 0, stdout: `${manifest.version}\n`, stderr: '' });
});

test('it exits 2 for a command it does not have', async () => {
  const result = await runCLI(buildMockCLIDeps({}), ['explode']);

  expect(result).toStrictEqual({ exitCode: 2, stdout: '', stderr: 'unknown command: explode\n' });
});

test('it exits 2 for a flag the command does not take', async () => {
  const ctx = setupTest({ json: {}, status: 200 }, 'http://boxxy.test');

  const result = await ctx.run(['item', 'show', 'i-1', '--verbose']);

  expect({ exitCode: result.exitCode, stderr: result.stderr.startsWith('error: ') }).toStrictEqual({
    exitCode: 2,
    stderr: true,
  });
});

test('it exits 2 and names BOXXY_URL when the server address is not set', async () => {
  const result = await runCLI(buildMockCLIDeps({}), ['status']);

  expect(result).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'error: BOXXY_URL is not set\n',
  });
});

test('it exits 2 when the server address is not an http address', async () => {
  const result = await runCLI(buildMockCLIDeps({ BOXXY_URL: 'ftp://boxxy.test' }), ['status']);

  expect(result).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'error: BOXXY_URL is not an http or https address\n',
  });
});

test('it exits 1 and prints the error when no server answers at the address', async () => {
  const result = await runCLI(buildMockCLIDeps({ BOXXY_URL: 'http://127.0.0.1:1' }), ['status']);

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    failed: result.stderr.startsWith('error: '),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    failed: true,
  });
});

test('it posts the command as a call to the RPC route and prints the answer as JSON', async () => {
  const ctx = setupTest({ json: { id: 'i-1' }, status: 200 }, 'http://boxxy.test');

  const result = await ctx.run(['item', 'show', 'i-1']);

  expect({ result, requests: ctx.requests }).toStrictEqual({
    result: { exitCode: 0, stdout: '{\n  "id": "i-1"\n}\n', stderr: '' },
    requests: [
      {
        url: 'http://boxxy.test/rpc/item/get',
        method: 'POST',
        headers: [],
        body: { json: { item: 'i-1' } },
      },
    ],
  });
});

test.each([
  [['--text', 'help'], 'help'],
  [['--text=--help'], '--help'],
])('it sends a flag value that is a help word, %p, as the value', async (flag, text) => {
  const ctx = setupTest({ json: {}, status: 200 }, 'http://boxxy.test');

  const result = await ctx.run(['item', 'note', 'i-1', ...flag]);

  expect({ exitCode: result.exitCode, requests: ctx.requests }).toStrictEqual({
    exitCode: 0,
    requests: [
      {
        url: 'http://boxxy.test/rpc/item/note',
        method: 'POST',
        headers: [],
        body: { json: { item: 'i-1', text } },
      },
    ],
  });
});

test('it keeps the path of the server address in front of the RPC route', async () => {
  const ctx = setupTest({ json: {}, status: 200 }, 'http://boxxy.test/base/');

  await ctx.run(['item', 'show', 'i-1']);

  expect(ctx.requests.map((request) => request.url)).toStrictEqual([
    'http://boxxy.test/base/rpc/item/get',
  ]);
});

test('it exits 1 and prints the code and message of an error the server defines', async () => {
  const ctx = setupTest(
    {
      json: { defined: true, code: 'NOT_FOUND', message: 'no item i-9', data: { item: 'i-9' } },
      status: 404,
    },
    'http://boxxy.test',
  );

  const result = await ctx.run(['item', 'show', 'i-9']);

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'error: NOT_FOUND: no item i-9 {"item":"i-9"}\n',
  });
});

test('it exits 1 for a refused answer and still prints it', async () => {
  const ctx = setupTest(
    { json: { kind: 'refused', reason: 'no' }, status: 200 },
    'http://boxxy.test',
  );

  const result = await ctx.run(['item', 'show', 'i-1']);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toStrictEqual({ kind: 'refused', reason: 'no' });
});

test('it prints the enrollment link of boxxy auth enroll over the RPC route', async () => {
  const ctx = setupTest(
    {
      json: {
        token: 'enroll-token-1',
        link: 'https://boxxy.example/enroll?token=enroll-token-1',
      },
      status: 200,
    },
    'http://boxxy.test',
  );

  const result = await ctx.run(['auth', 'enroll']);

  expect({ result, urls: ctx.requests.map((request) => request.url) }).toStrictEqual({
    result: {
      exitCode: 0,
      stdout:
        'Enrollment link: https://boxxy.example/enroll?token=enroll-token-1\nIt enrolls one passkey and expires soon. Open it in your browser now.\n',
      stderr: '',
    },
    urls: ['http://boxxy.test/rpc/auth/enroll'],
  });
});

test('it sends the name and each redirect URI of boxxy auth clients add', async () => {
  const ctx = setupTest(
    { json: { client: 'client-1', name: 'Dots' }, status: 200 },
    'http://boxxy.test',
  );

  const result = await ctx.run([
    'auth',
    'clients',
    'add',
    'Dots',
    '--redirect-uri',
    'https://dots.example/a',
    '--redirect-uri',
    'https://dots.example/b',
  ]);

  expect({ result, bodies: ctx.requests.map((request) => request.body) }).toStrictEqual({
    result: { exitCode: 0, stdout: 'Added Dots. Its client ID is client-1\n', stderr: '' },
    bodies: [
      {
        json: { name: 'Dots', redirectURIs: ['https://dots.example/a', 'https://dots.example/b'] },
      },
    ],
  });
});

test('it exits 1 when boxxy auth clients remove names no client', async () => {
  const ctx = setupTest({ json: { removed: false }, status: 200 }, 'http://boxxy.test');

  const result = await ctx.run(['auth', 'clients', 'remove', 'client-9']);

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: "boxxy auth clients remove: no client has the ID 'client-9'\n",
  });
});

test('it prints the revoked grant of boxxy auth grants revoke', async () => {
  const ctx = setupTest({ json: { revoked: true }, status: 200 }, 'http://boxxy.test');

  const result = await ctx.run(['auth', 'grants', 'revoke', 'grant-1']);

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'Revoked grant grant-1\n', stderr: '' });
});
