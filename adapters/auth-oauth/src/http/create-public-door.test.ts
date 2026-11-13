import { expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { authorizeTestClient } from '@zgeoff/mcp-auth/testing';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import { createPublicDoor } from './create-public-door.ts';
import type { McpServe } from './types.ts';

async function setupTest() {
  const folder = setupTempDir('boxxy-public-door-');
  const origin = 'https://boxxy.example';
  const lines: string[] = [];
  const serveMCP = mock<McpServe>(() => Promise.resolve(new Response('served')));

  const door = await createPublicDoor({
    publicURL: origin,
    hostname: '127.0.0.1',
    dbPath: join(folder.path, 'auth.db'),
    trustForwardedFrom: [],
    writeSecurityLine: (line) => {
      lines.push(line);
    },
    onSweepError: (error) => {
      throw error;
    },
    readPeer: () => '127.0.0.1',
    serveMCP,
  });

  registerTestCleanup(() => door.stop());

  return {
    door,
    origin,
    lines,
    serveMCP,
    send: (url: string, headers: Readonly<Record<string, string>>) =>
      door.answerRequest(
        new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: '{}',
        }),
      ),
  };
}

test('it hands a verified MCP request to serveMCP with the token, the client and its scopes', async () => {
  const ctx = await setupTest();
  const grant = await authorizeTestClient(ctx.door.auth, { scopes: ['read'] });

  await ctx.send(`${ctx.origin}/mcp`, {
    host: 'boxxy.example',
    authorization: `Bearer ${grant.accessToken}`,
  });

  expect(ctx.serveMCP).toHaveBeenCalledWith(expect.any(Request), {
    token: grant.accessToken,
    clientId: grant.clientID,
    scopes: ['read'],
    resourceMetadataUrl: 'https://boxxy.example/.well-known/oauth-protected-resource/mcp',
  });
});

test('it writes a security line for a token it never issued', async () => {
  const ctx = await setupTest();

  await ctx.send(`${ctx.origin}/mcp`, {
    host: 'boxxy.example',
    authorization: 'Bearer made-up-token',
  });

  expect(ctx.lines.map((line) => JSON.parse(line))).toStrictEqual([
    expect.objectContaining({ kind: 'bearer', outcome: 'rejected', reason: 'invalid_token' }),
  ]);
});

test('it answers the loopback host on a port it was given', async () => {
  const ctx = await setupTest();

  ctx.door.addLocalPort(4455);

  const response = await ctx.send('http://127.0.0.1:4455/mcp', { host: '127.0.0.1:4455' });

  expect(response.status).toBe(401);
});

test('it refuses the loopback host on a port it was not given', async () => {
  const ctx = await setupTest();
  const response = await ctx.send('http://127.0.0.1:4455/mcp', { host: '127.0.0.1:4455' });

  expect(response.status).toBe(403);
});

test('#admin.enroll answers a link to the enroll page that carries the token', async () => {
  const ctx = await setupTest();
  const enrollment = await ctx.door.admin.enroll();

  expect(enrollment).toStrictEqual({
    token: expect.any(String),
    link: `https://boxxy.example/enroll?token=${enrollment.token}`,
  });
});

test('#admin.addClient answers a conflict for a name another client has', async () => {
  const ctx = await setupTest();

  await ctx.door.admin.addClient('Alpha assistant', ['https://client.example/callback']);

  const answer = await ctx.door.admin.addClient('Alpha assistant', [
    'https://other.example/callback',
  ]);

  expect(answer).toStrictEqual({ kind: 'conflict', name: 'Alpha assistant' });
});

test('#admin.addClient refuses a redirect URI with a fragment', async () => {
  const ctx = await setupTest();

  const answer = await ctx.door.admin.addClient('Alpha assistant', [
    'https://client.example/callback#part',
  ]);

  expect(answer).toStrictEqual({ kind: 'refused', message: expect.any(String) });
});

test('#admin.removeClient removes the client with the ID', async () => {
  const ctx = await setupTest();

  const added = await ctx.door.admin.addClient('Alpha assistant', [
    'https://client.example/callback',
  ]);

  const clientID = added.kind === 'added' ? added.clientID : '';

  await ctx.door.admin.removeClient(clientID);

  const clients = await ctx.door.admin.listClients();

  expect(clients).toStrictEqual([]);
});

test('#admin.removeClient answers not-found for an unknown ID', async () => {
  const ctx = await setupTest();
  const answer = await ctx.door.admin.removeClient('no-such-client');

  expect(answer).toStrictEqual({ kind: 'not-found' });
});

test('#admin.revokeGrant ends the grant, so its token no longer verifies', async () => {
  const ctx = await setupTest();
  const grant = await authorizeTestClient(ctx.door.auth, { scopes: ['read'] });

  await ctx.door.admin.revokeGrant(grant.grantID);

  const access = await ctx.door.auth.verify(grant.accessToken);

  expect(access).toBeNull();
});
