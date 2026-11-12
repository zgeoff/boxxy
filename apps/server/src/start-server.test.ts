import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import invariant from 'tiny-invariant';
import { startServer } from './start-server.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-server-'));

  const rulesFolder = path.join(folder, 'rules');
  const configFile = path.join(folder, 'boxxy.json');

  const example = path.dirname(
    Bun.fileURLToPath(import.meta.resolve('@boxxy/rules/example/rules.yaml')),
  );

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  await cp(example, rulesFolder, { recursive: true });

  const config = {
    runner: 'runner-1',
    store: { file: path.join(folder, 'boxxy.db') },
    rules: { folder: rulesFolder },
    api: {
      listen: { hostname: '127.0.0.1', port: 0 },
      workerListen: { hostname: '127.0.0.1', port: 0 },
    },
    spawn: { target: 'cloud', repoPaths: {} },
    atc: { url: 'http://127.0.0.1:9/rpc', trustedFolders: {} },
  };

  await Bun.write(configFile, JSON.stringify(config));

  const env = {
    BOXXY_CONFIG: configFile,
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
  };

  const logged: string[] = [];

  return {
    env,
    folder,
    logged,

    // writes the configuration file again, with the given sections added
    addConfigSections: (sections: Readonly<Record<string, unknown>>) =>
      Bun.write(configFile, JSON.stringify({ ...config, ...sections })),
    start: async (overrides: Readonly<Record<string, string | undefined>>) => {
      const answer = await startServer({
        env: { ...env, ...overrides },
        log: {
          warn: (message) => {
            logged.push(message);
          },
        },
      });

      if (answer.kind === 'started') {
        onTestFinished(() => answer.server.stop());
      }

      return answer;
    },
  };
}

test('it refuses to start with no configuration path', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_CONFIG: undefined });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: 'set BOXXY_CONFIG to the path of the configuration file',
  });
});

test('it names each missing secret and prints no secret value', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_WORKER_TOKEN: '', BOXXY_ATC_TOKEN: undefined });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: 'set these variables: BOXXY_WORKER_TOKEN, BOXXY_ATC_TOKEN',
  });
});

test('it refuses to start when the trusted issuers folders hold no document, and names them', async () => {
  const ctx = await setupTest();

  const issuers = path.join(ctx.folder, 'issuers');

  await mkdir(issuers);

  await ctx.addConfigSections({
    trustedIssuers: { folders: [issuers], audience: 'boxxy.example.test' },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: `no trust document in ${issuers}`,
  });
});

test('it refuses to start on a trust document symlink that points nowhere, and names it', async () => {
  const ctx = await setupTest();

  const issuers = path.join(ctx.folder, 'issuers');

  await mkdir(issuers);
  await symlink('missing.json', path.join(issuers, 'issuer.json'));

  await ctx.addConfigSections({
    trustedIssuers: { folders: [issuers], audience: 'boxxy.example.test' },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: `the trust document at ${path.join(issuers, 'issuer.json')} points nowhere`,
  });
});

test('it starts and stops with a github section and a GitHub token', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({ github: { baseUrl: 'http://127.0.0.1:9' } });

  const answer = await ctx.start({ BOXXY_GITHUB_TOKEN: 'github-token-1' });

  expect(answer.kind).toBe('started');
});

test('it starts both listeners on the ports the system picks', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({});

  invariant(answer.kind === 'started', 'the server starts');

  expect([answer.server.ownerPort, answer.server.workerPort]).toSatisfyAll(
    (port: number) => port > 0,
  );
});
