import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { startServer } from '@boxxy/server';
import { waitFor } from '@boxxy/server/test-utils/wait-for';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { createFakeAtc } from '@boxxy/worker-atc/test-utils/create-fake-atc';
import { createFakeAtcServer } from '@boxxy/worker-atc/test-utils/create-fake-atc-server';
import invariant from 'tiny-invariant';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-atc-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const rulesFolder = path.join(folder, 'rules');

  const example = path.dirname(
    Bun.fileURLToPath(import.meta.resolve('@boxxy/rules/example/rules.yaml')),
  );

  await cp(example, rulesFolder, { recursive: true });

  const atc = createFakeAtc({ clock: createFakeClock(), targets: { cloud: 'suspending' } });
  const atcServer = createFakeAtcServer({ atc, token: 'atcs_test-token-0123', host: 'atc.test' });

  onTestFinished(() => atcServer.stop());

  const storeFile = path.join(folder, 'boxxy.db');
  const configFile = path.join(folder, 'boxxy.json');
  const warnings: string[] = [];

  await Bun.write(
    configFile,
    JSON.stringify({
      runner: 'runner-1',
      store: { file: storeFile },
      rules: { folder: rulesFolder },
      api: {
        listen: { hostname: '127.0.0.1', port: 0 },
        workerListen: { hostname: '127.0.0.1', port: 0 },
      },
      spawn: { target: 'cloud', repoPaths: { 'example/app': '/tmp/boxxy-test/repos/app' } },
      atc: {
        url: atcServer.url,
        host: 'atc.test',
        trustedFolders: { cloud: ['/tmp/boxxy-test/repos'] },
      },
    }),
  );

  return {
    atc,
    atcServer,
    warnings,

    // files one item in the store the server opens, through the store's own change
    createFiledItem: async () => {
      const store = await createSQLiteClaimStore(storeFile);
      const dispatch = await createTestDispatch({ store });

      await dispatch.seedItem({});
      await store.close();
    },
    startServer: async () => {
      const started = await startServer({
        env: {
          BOXXY_CONFIG: configFile,
          BOXXY_WORKER_TOKEN: 'worker-token-1',
          BOXXY_ATC_TOKEN: 'atcs_test-token-0123',
        },
        log: {
          warn: (message) => {
            warnings.push(message);
          },
        },
      });

      invariant(started.kind === 'started', 'the server starts on the stand-in atc');
      onTestFinished(() => started.server.stop());
    },
  };
}

test('it spawns a filed item on atc over MCP with the host name and the bearer and no warning', async () => {
  const ctx = await setupTest();

  await ctx.createFiledItem();
  await ctx.startServer();

  await waitFor(() => ctx.atc.calls.some((call) => call.tool === 'atc_session_spawn'), 15_000);

  expect([
    ctx.atc.calls.find((call) => call.tool === 'atc_session_spawn')?.args,
    ctx.atcServer.requests.every(
      (request) =>
        request.host === 'atc.test' && request.authorization === 'Bearer atcs_test-token-0123',
    ),
    ctx.warnings,
  ]).toStrictEqual([
    expect.objectContaining({
      target: 'cloud',
      cwd: '/tmp/boxxy-test/repos/app',
      name: expect.stringMatching(/^boxxy\//u),
    }),
    true,
    [],
  ]);
});
