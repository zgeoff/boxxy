import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { openTestAuth } from '@zgeoff/mcp-auth/testing';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import type { ServiceTokenReload } from './reload-service-tokens.ts';
import { startServiceTokenReloads } from './start-service-token-reloads.ts';

// Reloads of a service-token file with no clients, whose report throws on its first call.
async function setupTest() {
  const folder = setupTempDir('boxxy-service-token-reloads-');
  const filePath = join(folder.path, 'service-tokens.json');

  await Bun.write(filePath, JSON.stringify({ resource: 'https://app.example/mcp', clients: {} }));

  const opened = await openTestAuth({
    serviceTokens: {
      prefix: 'boxxy_svc_',
      file: { resource: 'https://app.example/mcp', clients: [] },
    },
  });

  registerTestCleanup(() => opened.close());

  const reports: ServiceTokenReload[] = [];
  const waiters: ((reload: ServiceTokenReload) => void)[] = [];

  const stop = startServiceTokenReloads({
    auth: opened.auth,
    path: filePath,
    onReload: (reload) => {
      reports.push(reload);
      waiters.shift()?.(reload);

      if (reports.length === 1) {
        throw new Error('the log sink is full');
      }
    },
  });

  registerTestCleanup(stop);

  return {
    stop,
    nextReload: () => {
      const waiting = Promise.withResolvers<ServiceTokenReload>();

      waiters.push(waiting.resolve);

      return waiting.promise;
    },
  };
}

test('it still reloads on the next SIGHUP after a report throws', async () => {
  const ctx = await setupTest();

  const first = ctx.nextReload();

  process.kill(process.pid, 'SIGHUP');

  await first;

  const second = ctx.nextReload();

  process.kill(process.pid, 'SIGHUP');

  const reload = await second;

  expect(reload).toStrictEqual({ kind: 'replaced', clients: 0 });
});

test('it stops cleanly after a report throws', async () => {
  const ctx = await setupTest();

  const first = ctx.nextReload();

  process.kill(process.pid, 'SIGHUP');

  await first;

  await expect(ctx.stop()).toResolve();
});
