import { expect, test } from 'bun:test';
import { authorizeTestClient } from '@boxxy/auth-oauth/test-utils/authorize-test-client';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { maxRequestBytes } from './serve-api.ts';
import { servePublicDoor } from './serve-public-door.ts';
import { buildMCPRequest } from './test-utils/build-mcp-request.ts';
import { buildRPCRequest } from './test-utils/build-rpc-request.ts';
import { createTestServer } from './test-utils/create-test-server.ts';
import { listOwnerTools } from './test-utils/list-owner-procedures.ts';
import { readMCPAnswer } from './test-utils/read-mcp-answer.ts';

async function setupTest() {
  const server = await createTestServer({ hasPublicDoor: true });

  const door = server.publicDoor;

  invariant(door !== null, 'the test server runs a public door');

  const origin = server.publicOrigin;

  return {
    ...server,
    door,
    origin,
    issueToken: async (ticked: readonly string[]) => {
      const grant = await authorizeTestClient(door, {
        origin,
        requested: ['read', 'write', 'offline_access'],
        ticked,
      });

      return grant.accessToken;
    },
    listItemIds: async () => {
      const response = await server.owner(buildRPCRequest({ procedure: 'item.list', input: {} }));
      const json: unknown = await response.json();

      const itemShape = z.object({ id: z.string() });
      const list = z.object({ json: z.object({ items: z.array(itemShape) }) });
      const body = list.parse(json);

      return body.json.items.map((item) => item.id);
    },
    call: (method: string, params: Record<string, unknown>, token?: string) =>
      door.answerRequest(
        buildMCPRequest({
          path: '/mcp',
          method,
          params,
          origin,
          ...(token === undefined ? {} : { token }),
        }),
      ),
  };
}

test('it answers a request with no token with 401', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('tools/list', {});

  expect(response.status).toBe(401);
});

test('it answers the worker token with 401', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('tools/list', {}, ctx.workerToken);

  expect(response.status).toBe(401);
});

test.each([['/rpc/item/list'], ['/healthz'], ['/mcp/session'], ['/no-such-path']])(
  'it answers 404 on the public door for %s, even with a valid token',
  async (path) => {
    const ctx = await setupTest();
    const token = await ctx.issueToken(['read', 'write']);

    const response = await ctx.door.answerRequest(
      new Request(`${ctx.origin}${path}`, {
        method: 'POST',
        headers: { host: 'boxxy.test', authorization: `Bearer ${token}` },
        body: '{}',
      }),
    );

    expect(response.status).toBe(404);
  },
);

test('it refuses a Host header that is not the public one with 403', async () => {
  const ctx = await setupTest();

  const response = await ctx.door.answerRequest(
    new Request(`${ctx.origin}/mcp`, { method: 'POST', headers: { host: 'rebound.example' } }),
  );

  expect(response.status).toBe(403);
});

test('it lists every owner tool to a token with the read scope', async () => {
  const ctx = await setupTest();
  const token = await ctx.issueToken(['read']);
  const response = await ctx.call('tools/list', {}, token);
  const answer = await readMCPAnswer(response);

  const tools = z.array(z.object({ name: z.string() })).parse(answer.result?.['tools']);
  const expected = listOwnerTools().map(([name]) => name);

  expect(tools.map((tool) => tool.name).toSorted()).toStrictEqual(expected.toSorted());
});

test('it answers 403 insufficient_scope to a read token that calls a write tool', async () => {
  const ctx = await setupTest();
  const token = await ctx.issueToken(['read']);

  const response = await ctx.call(
    'tools/call',
    { name: 'item_file', arguments: { repo: 'r', title: 't', outcome: 'o' } },
    token,
  );

  expect({
    status: response.status,
    challenge: response.headers.get('www-authenticate'),
  }).toStrictEqual({
    status: 403,
    challenge: expect.stringContaining('error="insufficient_scope"'),
  });
});

test('it files no item when a read token calls item_file', async () => {
  const ctx = await setupTest();
  const token = await ctx.issueToken(['read']);

  const [repo] = [...ctx.deps.repos];

  await ctx.call(
    'tools/call',
    { name: 'item_file', arguments: { repo, title: 'a title', outcome: 'an outcome' } },
    token,
  );

  const items = await ctx.listItemIds();

  expect(items).toStrictEqual([]);
});

test('it files an item when a write token calls item_file', async () => {
  const ctx = await setupTest();
  const token = await ctx.issueToken(['write']);

  const [repo] = [...ctx.deps.repos];

  await ctx.call(
    'tools/call',
    { name: 'item_file', arguments: { repo, title: 'a title', outcome: 'an outcome' } },
    token,
  );

  const items = await ctx.listItemIds();

  expect(items).toHaveLength(1);
});

test('it runs a read tool for a read token', async () => {
  const ctx = await setupTest();
  const token = await ctx.issueToken(['read']);
  const response = await ctx.call('tools/call', { name: 'item_list', arguments: {} }, token);
  const answer = await readMCPAnswer(response);

  expect({ status: response.status, isError: answer.result?.['isError'] }).toStrictEqual({
    status: 200,
    isError: undefined,
  });
});

test('it answers 413 to a streamed body over the limit, with no length header', async () => {
  const ctx = await setupTest();

  const chunk = new Uint8Array(maxRequestBytes);

  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(chunk);
      controller.enqueue(chunk);
      controller.close();
    },
  });

  const response = await servePublicDoor(ctx.door).handle(
    new Request(`${ctx.origin}/oauth2/token`, {
      method: 'POST',
      headers: { host: 'boxxy.test', 'content-type': 'application/x-www-form-urlencoded' },
      body,
      duplex: 'half',
    }),
  );

  expect(response.status).toBe(413);
});
