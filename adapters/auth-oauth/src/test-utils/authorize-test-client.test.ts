import { expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import type { McpServe } from '../http/answer-mcp-request.ts';
import { createPublicDoor } from '../http/create-public-door.ts';
import { authorizeTestClient } from './authorize-test-client.ts';
import { registerTestCleanup } from './register-test-cleanup.ts';
import { setupTempDir } from './setup-temp-dir.ts';

async function setupTest() {
  const temporaryDirectory = setupTempDir('boxxy-public-door-');
  const origin = 'https://boxxy.example';
  const lines: string[] = [];
  const serveMCP = mock<McpServe>(() => Promise.resolve(new Response('served')));

  const door = await createPublicDoor({
    publicURL: origin,
    hostname: '127.0.0.1',
    dbPath: join(temporaryDirectory.path, 'auth.db'),
    trustForwardedFrom: [],
    writeSecurityLine: (line) => {
      lines.push(line);
    },
    readPeer: () => '127.0.0.1',
    serveMCP,
  });

  registerTestCleanup(() => door.stop());

  const send = (path: string, headers: Readonly<Record<string, string>> = {}) =>
    door.answerRequest(
      new Request(`${origin}${path}`, {
        method: 'POST',
        headers: { host: 'boxxy.example', 'content-type': 'application/json', ...headers },
        body: '{}',
      }),
    );

  return { door, origin, lines, serveMCP, send };
}

test('it answers a request with no token with 401 and points at the resource metadata', async () => {
  const ctx = await setupTest();
  const answered = await ctx.send('/mcp');

  expect({
    status: answered.status,
    challenge: answered.headers.get('www-authenticate'),
  }).toStrictEqual({
    status: 401,
    challenge:
      'Bearer resource_metadata="https://boxxy.example/.well-known/oauth-protected-resource/mcp"',
  });

  expect(ctx.serveMCP).not.toHaveBeenCalled();
});

test('it answers a token it never issued with 401 and records the refusal', async () => {
  const ctx = await setupTest();
  const answered = await ctx.send('/mcp', { authorization: 'Bearer made-up-token' });

  expect(answered.status).toBe(401);

  expect(ctx.lines.map((line): unknown => JSON.parse(line))).toStrictEqual([
    expect.objectContaining({ kind: 'bearer', outcome: 'rejected', reason: 'invalid_token' }),
  ]);
});

test('it serves an MCP request with the scopes that the owner ticked', async () => {
  const ctx = await setupTest();

  const grant = await authorizeTestClient(ctx.door, {
    origin: ctx.origin,
    requested: ['read', 'write', 'offline_access'],
    ticked: ['read'],
  });

  const answered = await ctx.send('/mcp', { authorization: `Bearer ${grant.accessToken}` });
  const body = await answered.text();

  expect(body).toBe('served');

  expect(ctx.serveMCP).toHaveBeenCalledWith(expect.any(Request), {
    token: grant.accessToken,
    clientId: grant.clientID,
    scopes: ['read'],
    resourceMetadataUrl: 'https://boxxy.example/.well-known/oauth-protected-resource/mcp',
  });
});

test('it refuses a Host header that the door does not serve with 403', async () => {
  const ctx = await setupTest();

  const answered = await ctx.door.answerRequest(
    new Request(`${ctx.origin}/mcp`, { method: 'POST', headers: { host: 'rebound.example' } }),
  );

  expect(answered.status).toBe(403);
});

test('it refuses a grant that the owner revoked with 401 on the next request', async () => {
  const ctx = await setupTest();

  const grant = await authorizeTestClient(ctx.door, {
    origin: ctx.origin,
    requested: ['read', 'offline_access'],
    ticked: ['read'],
  });

  const [listed] = await ctx.door.admin.listGrants();

  await ctx.door.admin.revokeGrant(listed?.grantID ?? '');

  const answered = await ctx.send('/mcp', { authorization: `Bearer ${grant.accessToken}` });

  expect(answered.status).toBe(401);
});
