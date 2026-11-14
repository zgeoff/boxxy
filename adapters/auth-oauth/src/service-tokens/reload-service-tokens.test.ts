import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { openTestAuth } from '@zgeoff/mcp-auth/testing';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import { reloadServiceTokens } from './reload-service-tokens.ts';

// An auth core that starts with one service client, `quay-reader`, and its static token, which
// `verify` checks with no token exchange, and the path of a service-token file that the test writes.
async function setupTest() {
  const folder = setupTempDir('boxxy-service-tokens-');
  const filePath = join(folder.path, 'service-tokens.json');

  const opened = await openTestAuth({
    serviceTokens: {
      prefix: 'boxxy_svc_',
      file: {
        resource: 'https://app.example/mcp',
        clients: [
          {
            name: 'quay-reader',
            scopes: ['read'],
            tokens: ['boxxy_svc_quayreaderquayreaderquay01'],
          },
        ],
      },
    },
  });

  registerTestCleanup(() => opened.close());

  return {
    writeFile: (text: string) => Bun.write(filePath, text),
    reload: () => reloadServiceTokens(opened.auth, filePath),
    verify: (bearer: string) => opened.auth.verify(bearer),
  };
}

test('it replaces the service clients with those of a valid file', async () => {
  const ctx = await setupTest();

  await ctx.writeFile(
    JSON.stringify({
      resource: 'https://app.example/mcp',
      clients: {
        'dock-reader': {
          scopes: ['read'],
          secretDigests: ['8f5dce3101b35b758cca5d0a431e6cbbf9619a6614d38cbdc7d5294db5a06804'],
        },
      },
    }),
  );

  const reload = await ctx.reload();

  expect(reload).toStrictEqual({ kind: 'replaced', clients: 1 });
});

test('it revokes the last service client when the reloaded file names none', async () => {
  const ctx = await setupTest();

  await ctx.writeFile(JSON.stringify({ resource: 'https://app.example/mcp', clients: {} }));

  const reload = await ctx.reload();

  expect({
    reload,
    dropped: await ctx.verify('boxxy_svc_quayreaderquayreaderquay01'),
  }).toStrictEqual({ reload: { kind: 'replaced', clients: 0 }, dropped: null });
});

test.each([
  { problem: 'is not JSON', text: '{"resource":' },
  {
    problem: 'holds a static token',
    text: JSON.stringify({
      resource: 'https://app.example/mcp',
      clients: {
        'dock-reader': { scopes: ['read'], tokens: ['boxxy_svc_dockreaderdockreaderdock01'] },
      },
    }),
  },
  {
    problem: 'names another resource',
    text: JSON.stringify({ resource: 'https://other.example/mcp', clients: {} }),
  },
])('it keeps the old service clients when the new file $problem', async (row) => {
  const ctx = await setupTest();

  await ctx.writeFile(row.text);

  const reload = await ctx.reload();

  expect({
    reload,
    kept: await ctx.verify('boxxy_svc_quayreaderquayreaderquay01'),
  }).toStrictEqual({
    reload: { kind: 'kept', reason: expect.any(String) },
    kept: {
      kind: 'service',
      clientID: 'service:quay-reader',
      clientName: 'service:quay-reader',
      scopes: ['read'],
    },
  });
});

test('it keeps the old service clients when the file is gone', async () => {
  const ctx = await setupTest();
  const reload = await ctx.reload();

  expect({
    reload,
    kept: await ctx.verify('boxxy_svc_quayreaderquayreaderquay01'),
  }).toStrictEqual({
    reload: { kind: 'kept', reason: 'the file cannot be read (ENOENT)' },
    kept: expect.objectContaining({ clientID: 'service:quay-reader' }),
  });
});
