import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { buildMCPRequest } from './build-mcp-request.ts';
import { createTestServer } from './create-test-server.ts';
import { readMCPAnswer } from './read-mcp-answer.ts';
import { sendHttpRequest } from './send-http-request.ts';
import { serveLoopbackDoor } from './serve-loopback-door.ts';

// The door on a loopback port, whose one service client `dock-reader` has the secret
// `svcs_dockreaderdockreaderdockreaderdock01`.
async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-loopback-door-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const server = await createTestServer();

  const door = await serveLoopbackDoor({
    folder: join(folder, 'door'),
    client: {
      name: 'dock-reader',
      digest: '8f5dce3101b35b758cca5d0a431e6cbbf9619a6614d38cbdc7d5294db5a06804',
    },
    readDeps: () => server.deps,
    onServiceTokenReload: () => {},
  });

  onTestFinished(() => door.stop());

  return {
    door,
    requestToken: () =>
      sendHttpRequest(
        new Request(`${door.origin}/oauth2/token`, {
          method: 'POST',
          headers: {
            authorization: `Basic ${btoa('service:dock-reader:svcs_dockreaderdockreaderdockreaderdock01')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials&scope=read%20write',
        }),
      ),
    listTools: (token: string) =>
      sendHttpRequest(
        buildMCPRequest({
          path: '/mcp',
          method: 'tools/list',
          params: {},
          token,
          origin: door.origin,
        }),
      ),
  };
}

test("it lists the owner's tools to the service client of its file, signed in with both scopes", async () => {
  const ctx = await setupTest();
  const issued = await ctx.requestToken();

  const body: unknown = JSON.parse(issued.text);
  const token = z.object({ access_token: z.string() }).parse(body);

  const listed = await ctx.listTools(token.access_token);

  const response = new Response(listed.text, { headers: { 'content-type': listed.contentType } });

  const answer = await readMCPAnswer(response);

  expect(answer.result?.['tools']).toIncludeAllPartialMembers([
    { name: 'item_file' },
    { name: 'item_get' },
  ]);
});

test('it keeps the service-token file readable by its owner alone', async () => {
  const ctx = await setupTest();
  const info = await stat(ctx.door.serviceTokensFile);

  expect(info.mode & 0o777).toBe(0o600);
});
