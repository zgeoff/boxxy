import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readServerConfig } from './read-server-config.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-config-'));

  const file = path.join(folder, 'boxxy.json');

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  return { file, writeConfig: (text: string) => Bun.write(file, text) };
}

test('it reads a configuration file that passes the schema', async () => {
  const ctx = await setupTest();

  const config = {
    runner: 'runner-1',
    store: { file: '/tmp/boxxy-test/boxxy.db' },
    rules: { folder: '/tmp/boxxy-test/rules', ref: 'origin/main' },
    api: {
      listen: { hostname: '127.0.0.1', port: 4400 },
      workerListen: { hostname: '127.0.0.1', port: 4401 },
    },
    spawn: {
      target: 'cloud',
      repos: { 'example/app': '/tmp/boxxy-test/app' },
      reviewAgents: ['claude-review'],
    },
    atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: { cloud: ['/tmp/boxxy-test'] } },
  };

  await ctx.writeConfig(JSON.stringify(config));

  const answer = await readServerConfig(ctx.file);

  expect(answer).toStrictEqual({ kind: 'read', config });
});

test('it defaults the rules ref to origin/main', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: { target: 'cloud', repos: {} },
      atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer.kind === 'read' && answer.config.rules).toStrictEqual({
    folder: '/tmp/boxxy-test/rules',
    ref: 'origin/main',
  });
});

test('it reads a spawn section with no review agents as an empty list', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: { target: 'cloud', repos: {} },
      atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer.kind === 'read' && answer.config.spawn.reviewAgents).toStrictEqual([]);
});

test('it reads a repo as a git source of a URL and a ref', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: {
        target: 'cloud',
        repos: { 'example/app': { url: 'https://git.example.test/example/app.git', ref: 'main' } },
      },
      atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer).toMatchObject({
    kind: 'read',
    config: {
      spawn: {
        repos: { 'example/app': { url: 'https://git.example.test/example/app.git', ref: 'main' } },
      },
    },
  });
});

test('it reads a git source with the name of the variable that holds its clone token', async () => {
  const ctx = await setupTest();

  const source = {
    url: 'https://git.example.test/example/app.git',
    ref: 'main',
    credentialRef: { name: 'EXAMPLE_GIT_TOKEN' },
  };

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: { target: 'cloud', repos: { 'example/app': source } },
      atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer.kind === 'read' && answer.config.spawn.repos['example/app']).toStrictEqual(source);
});

test.each([
  [
    'a git source whose credentialRef names no environment variable',
    {
      url: 'https://git.example.test/a.git',
      ref: 'main',
      credentialRef: { name: '1-EXAMPLE TOKEN' },
    },
  ],
  [
    'both a folder and a git source',
    { path: '/tmp/boxxy-test/app', url: 'https://git.example.test/a.git', ref: 'main' },
  ],
  ['neither a folder nor a git source', {}],
  [
    'a git source with a credential in its URL',
    { url: 'https://u:p@git.example.test/a.git', ref: 'main' },
  ],
  [
    'a git source with a credential field',
    { url: 'https://git.example.test/a.git', ref: 'main', credentialEnv: 'EXAMPLE_GIT_TOKEN' },
  ],
])('it answers invalid for a repo with %s', async (_title, repo) => {
  const ctx = await setupTest();

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: { target: 'cloud', repos: { 'example/app': repo } },
      atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer).toMatchObject({ kind: 'invalid' });
});

test('it reads the optional sections: trusted issuers, pepys and github', async () => {
  const ctx = await setupTest();

  const config = {
    runner: 'runner-1',
    store: { file: '/tmp/boxxy-test/boxxy.db' },
    rules: { folder: '/tmp/boxxy-test/rules', ref: 'upstream/rules' },
    api: {
      listen: { hostname: '127.0.0.1', port: 4400 },
      workerListen: { hostname: '127.0.0.1', port: 4401 },
    },
    spawn: { target: 'cloud', repos: {}, reviewAgents: [] },
    atc: {
      url: 'http://atc-gateway.example.test:8080/mcp',
      host: 'atc.example.test',
      trustedFolders: {},
    },
    trustedIssuers: { folders: ['/tmp/boxxy-test/issuers'], audience: 'boxxy.example.test' },
    pepys: {
      ingestUrl: 'https://pepys.example.test/ingest/boxxy',
      apiUrl: 'https://pepys.example.test/rpc',
      environment: 'production',
    },
    github: { baseUrl: 'https://github-api.example.test' },
  };

  await ctx.writeConfig(JSON.stringify(config));

  const answer = await readServerConfig(ctx.file);

  expect(answer).toStrictEqual({ kind: 'read', config });
});

test('it refuses a github section whose base URL is not a URL', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: { target: 'cloud', repos: {} },
      atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
      github: { baseUrl: 'api.github' },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer.kind).toBe('invalid');
});

test('it refuses an atc host that is no host name, such as one with a line break', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(
    JSON.stringify({
      runner: 'runner-1',
      store: { file: '/tmp/boxxy-test/boxxy.db' },
      rules: { folder: '/tmp/boxxy-test/rules' },
      api: {
        listen: { hostname: '127.0.0.1', port: 4400 },
        workerListen: { hostname: '127.0.0.1', port: 4401 },
      },
      spawn: { target: 'cloud', repos: {} },
      atc: {
        url: 'http://127.0.0.1:7777/mcp',
        host: 'atc.example.test\r\nx-extra: 1',
        trustedFolders: {},
      },
    }),
  );

  const answer = await readServerConfig(ctx.file);

  expect(answer.kind).toBe('invalid');
});

test('it refuses a field the schema does not know, such as a token', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(JSON.stringify({ runner: 'runner-1', workerToken: 'x' }));

  const answer = await readServerConfig(ctx.file);

  expect(answer.kind).toBe('invalid');
});

test('it refuses a file that is not JSON', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig('runner: runner-1');

  const answer = await readServerConfig(ctx.file);

  expect(answer).toStrictEqual({
    kind: 'invalid',
    message: `the configuration file at ${ctx.file} is not JSON`,
  });
});

test('it refuses a path with no file', async () => {
  const ctx = await setupTest();
  const answer = await readServerConfig(`${ctx.file}.missing`);

  expect(answer).toStrictEqual({
    kind: 'invalid',
    message: `no configuration file at ${ctx.file}.missing`,
  });
});

test('it defaults the public door to loopback with no trusted proxy', async () => {
  const ctx = await setupTest();

  const config = {
    runner: 'runner-1',
    store: { file: '/tmp/boxxy-test/boxxy.db' },
    rules: { folder: '/tmp/boxxy-test/rules' },
    api: {
      listen: { hostname: '127.0.0.1', port: 4400 },
      workerListen: { hostname: '127.0.0.1', port: 4401 },
    },
    spawn: { target: 'cloud', repos: {} },
    atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
    publicDoor: { port: 4402, publicURL: 'https://boxxy.example.test' },
  };

  await ctx.writeConfig(JSON.stringify(config));

  const answer = await readServerConfig(ctx.file);

  expect(answer).toStrictEqual({
    kind: 'read',
    config: expect.objectContaining({
      publicDoor: {
        port: 4402,
        hostname: '127.0.0.1',
        publicURL: 'https://boxxy.example.test',
        trustForwardedFrom: [],
      },
    }),
  });
});
