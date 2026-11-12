import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { brandSchemas } from '@boxxy/model';
import { startServer } from '@boxxy/server';
import { waitFor } from '@boxxy/server/test-utils/wait-for';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { createFakeAtc } from '@boxxy/worker-atc/test-utils/create-fake-atc';
import { createFakeAtcServer } from '@boxxy/worker-atc/test-utils/create-fake-atc-server';
import invariant from 'tiny-invariant';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-notice-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const rulesFolder = path.join(folder, 'rules');

  const example = path.dirname(
    Bun.fileURLToPath(import.meta.resolve('@boxxy/rules/example/rules.yaml')),
  );

  await cp(example, rulesFolder, { recursive: true });

  const atc = createFakeAtc({ clock: createFakeClock(), targets: { cloud: 'suspending' } });

  // the gateway takes the notice token alone, with the message scope alone
  const atcServer = createFakeAtcServer({
    atc,
    token: 'atcs_notice-token-0123',
    host: 'atc.test',
    scopes: ['message'],
  });

  onTestFinished(() => atcServer.stop());

  const storeFile = path.join(folder, 'boxxy.db');
  const configFile = path.join(folder, 'boxxy.json');

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
      spawn: { target: 'cloud', repos: {} },
      atc: { url: atcServer.url, host: 'atc.test', trustedFolders: {} },
    }),
  );

  return {
    atc,

    // one unsent hold notice in the store the server opens, due at once
    insertNotice: async () => {
      const store = await createSQLiteClaimStore(storeFile);

      const at = brandSchemas.instant.parse(0);

      await store.exclusive((tx) =>
        tx.applyChange({
          at,
          writes: [
            {
              op: 'insert',
              table: 'notices',
              row: {
                id: 1,
                item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000a1'),
                reason: brandSchemas.rulesHoldReason.parse('blocked'),
                at,
                tries: 0,
                sentAt: null,
                keySeq: 0,
                keyTries: 0,
                nextTryAt: at,
              },
            },
          ],
          facts: [],
        }),
      );

      await store.close();
    },
    startServer: async () => {
      const started = await startServer({
        env: {
          BOXXY_CONFIG: configFile,
          BOXXY_WORKER_TOKEN: 'worker-token-1',
          BOXXY_ATC_TOKEN: 'atcs_worker-token-0123',
          BOXXY_ATC_NOTICE_SESSION: 'desk.3.s7',
          BOXXY_ATC_NOTICE_TOKEN: 'atcs_notice-token-0123',
        },
        log: {
          warn: () => {
            // the worker calls fail on this gateway, which takes the notice token alone
          },
        },
      });

      invariant(started.kind === 'started', 'the server starts on the stand-in atc');
      onTestFinished(() => started.server.stop());
    },
  };
}

test('it sends a hold notice to the notice session by its ID with the notice token', async () => {
  const ctx = await setupTest();

  await ctx.insertNotice();
  await ctx.startServer();

  await waitFor(() => ctx.atc.calls.some((call) => call.tool === 'atc_message_send'), 15_000);

  expect(ctx.atc.calls.find((call) => call.tool === 'atc_message_send')?.args).toStrictEqual({
    session: 'desk.3.s7',
    text: expect.stringContaining('0190a6f4-0000-7000-8000-0000000000a1'),
    idempotencyKey: 'boxxy-notice:1:0',
  });
});
