import { expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { authorizeTestClient } from '@zgeoff/mcp-auth/testing';
import { registerTestCleanup } from '@zgeoff/testing';
import { createTempDir } from '@zgeoff/testing/fs';
import { z } from 'zod';
import type { ServiceTokenReload } from '../service-tokens/reload-service-tokens.ts';
import { createPublicDoor } from './create-public-door.ts';
import type { McpServe } from './types.ts';

// A door at https://boxxy.example whose service-token file names one client, `quay-reader`, with
// the read scope and the digest of the secret `svcs_quayreaderquayreaderquayreaderquay01`.
async function setupTest() {
  const folder = createTempDir('boxxy-public-door');
  const origin = 'https://boxxy.example';
  const lines: string[] = [];
  const waiters: ((reload: ServiceTokenReload) => void)[] = [];
  const serveMCP = mock<McpServe>(() => Promise.resolve(new Response('served')));
  const serviceTokensFile = join(folder.path, 'service-tokens.json');

  await Bun.write(
    serviceTokensFile,
    JSON.stringify({
      resource: 'https://boxxy.example/mcp',
      clients: {
        'quay-reader': {
          scopes: ['read'],
          secretDigests: ['edcf76230c5f263afc457c110b580af491e99729113b05a3dfbf1b90d52b8ceb'],
        },
      },
    }),
  );

  const openDoor = async (file: string) => {
    const opened = await createPublicDoor({
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
      serviceTokens: {
        file,
        onReload: (reload) => {
          for (const resolve of waiters.splice(0)) {
            resolve(reload);
          }
        },
      },
    });

    registerTestCleanup(() => opened.stop());

    return opened;
  };

  const door = await openDoor(serviceTokensFile);

  return {
    door,
    origin,
    lines,
    serveMCP,

    // the outcome of the next reload the door reports
    nextReload: () => {
      const next = Promise.withResolvers<ServiceTokenReload>();

      waiters.push(next.resolve);

      return next.promise;
    },
    folder: folder.path,
    openDoor,
    writeServiceTokens: (text: string) => Bun.write(serviceTokensFile, text),
    requestToken: (basic: string) =>
      door.answerRequest(
        new Request(`${origin}/oauth2/token`, {
          method: 'POST',
          headers: {
            host: 'boxxy.example',
            authorization: `Basic ${btoa(basic)}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials&scope=read',
        }),
      ),
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

  expect(ctx.lines.map((line): unknown => JSON.parse(line))).toStrictEqual([
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

test('it gives a service client of its service-token file an access token that /mcp serves', async () => {
  const ctx = await setupTest();

  const issued = await ctx.requestToken(
    'service:quay-reader:svcs_quayreaderquayreaderquayreaderquay01',
  );

  const body: unknown = await issued.json();

  const token = z.object({ access_token: z.string() }).parse(body);

  await ctx.send(`${ctx.origin}/mcp`, {
    host: 'boxxy.example',
    authorization: `Bearer ${token.access_token}`,
  });

  expect(ctx.serveMCP).toHaveBeenCalledWith(
    expect.any(Request),
    expect.objectContaining({ clientId: 'service:quay-reader', scopes: ['read'] }),
  );
});

test.each([
  { client: 'service:dock-reader', secret: 'svcs_quayreaderquayreaderquayreaderquay01' },
  { client: 'service:quay-reader', secret: 'svcs_dockreaderdockreaderdockreaderdock01' },
])('it refuses a token request from $client with invalid_client', async (row) => {
  const ctx = await setupTest();
  const refused = await ctx.requestToken(`${row.client}:${row.secret}`);

  expect({ status: refused.status, body: await refused.json() }).toStrictEqual({
    status: 401,
    body: expect.objectContaining({ error: 'invalid_client' }),
  });
});

test.each([
  {
    problem: 'is not JSON',
    text: '{"resource":',
    message: /broken-service-tokens\.json is not valid: the file is not valid JSON/u,
  },
  {
    problem: 'names another resource',
    text: JSON.stringify({ resource: 'https://other.example/mcp', clients: {} }),
    message:
      /broken-service-tokens\.json is not valid: it names the resource https:\/\/other\.example\/mcp/u,
  },
  {
    problem: 'holds a static token',
    text: JSON.stringify({
      resource: 'https://boxxy.example/mcp',
      clients: {
        'dock-reader': { scopes: ['read'], tokens: ['boxxy_svc_dockreaderdockreaderdockreader01'] },
      },
    }),
    message: /broken-service-tokens\.json is not valid: .*static token/u,
  },
])('it refuses to start with a service-token file that $problem', async (row) => {
  const ctx = await setupTest();

  const file = join(ctx.folder, 'broken-service-tokens.json');

  await Bun.write(file, row.text);

  expect(ctx.openDoor(file)).rejects.toThrow(row.message);
});

test('it refuses to start with a service-token file that is missing', async () => {
  const ctx = await setupTest();

  expect(ctx.openDoor(join(ctx.folder, 'no-such-file.json'))).rejects.toThrow(/ENOENT/u);
});

test('it revokes the last service client once SIGHUP reloads a file that names none', async () => {
  const ctx = await setupTest();

  const basic = 'service:quay-reader:svcs_quayreaderquayreaderquayreaderquay01';

  await ctx.writeServiceTokens(
    JSON.stringify({ resource: 'https://boxxy.example/mcp', clients: {} }),
  );

  const reloaded = ctx.nextReload();

  process.kill(process.pid, 'SIGHUP');

  await reloaded;

  const refused = await ctx.requestToken(basic);

  // with no client that holds a secret, the package stops offering the grant at all
  expect({ status: refused.status, body: await refused.json() }).toStrictEqual({
    status: 400,
    body: expect.objectContaining({ error: 'unsupported_grant_type' }),
  });
});

test('it reports the reason it keeps its service clients when SIGHUP finds a broken file', async () => {
  const ctx = await setupTest();

  await ctx.writeServiceTokens('{"resource":');

  const reloaded = ctx.nextReload();

  process.kill(process.pid, 'SIGHUP');

  const reload = await reloaded;

  expect(reload).toStrictEqual({ kind: 'kept', reason: 'the file is not valid JSON' });
});

test('it still signs in a service client after SIGHUP finds a broken file', async () => {
  const ctx = await setupTest();

  await ctx.writeServiceTokens('{"resource":');

  const reloaded = ctx.nextReload();

  process.kill(process.pid, 'SIGHUP');

  await reloaded;

  const issued = await ctx.requestToken(
    'service:quay-reader:svcs_quayreaderquayreaderquayreaderquay01',
  );

  expect(issued.status).toBe(200);
});

test('it stops listening for SIGHUP once it stops', async () => {
  const listening = process.listenerCount('SIGHUP');

  const ctx = await setupTest();

  await ctx.door.stop();

  expect(process.listenerCount('SIGHUP')).toBe(listening);
});
