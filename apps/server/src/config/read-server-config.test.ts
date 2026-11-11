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
    rules: { folder: '/tmp/boxxy-test/rules' },
    api: {
      listen: { hostname: '127.0.0.1', port: 4400 },
      workerListen: { hostname: '127.0.0.1', port: 4401 },
    },
    spawn: { target: 'cloud', repoPaths: { 'example/app': '/tmp/boxxy-test/app' } },
    atc: { url: 'http://127.0.0.1:7777/rpc', trustedFolders: { cloud: ['/tmp/boxxy-test'] } },
  };

  await ctx.writeConfig(JSON.stringify(config));

  const answer = await readServerConfig(ctx.file);

  expect(answer).toStrictEqual({ kind: 'read', config });
});

test('it reads the optional sections: trusted issuers, pepys and github', async () => {
  const ctx = await setupTest();

  const config = {
    runner: 'runner-1',
    store: { file: '/tmp/boxxy-test/boxxy.db' },
    rules: { folder: '/tmp/boxxy-test/rules' },
    api: {
      listen: { hostname: '127.0.0.1', port: 4400 },
      workerListen: { hostname: '127.0.0.1', port: 4401 },
    },
    spawn: { target: 'cloud', repoPaths: {} },
    atc: { url: 'http://127.0.0.1:7777/rpc', trustedFolders: {} },
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
      spawn: { target: 'cloud', repoPaths: {} },
      atc: { url: 'http://127.0.0.1:7777/rpc', trustedFolders: {} },
      github: { baseUrl: 'api.github' },
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
