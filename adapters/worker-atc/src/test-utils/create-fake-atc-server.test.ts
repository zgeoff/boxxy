import { expect, onTestFinished, test } from 'bun:test';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { createFakeAtcServer } from './create-fake-atc-server.ts';
import { createFakeAtc } from './create-fake-atc.ts';

function setupTest() {
  const atc = createFakeAtc({ clock: createFakeClock(), targets: { box: 'suspending' } });

  const server = createFakeAtcServer({
    atc,
    token: 'atcs_test-token-0123',
    host: 'atc.test',
    scopes: ['read'],
  });

  onTestFinished(() => server.stop());

  return {
    atc,
    server,
    postToolCall: (tool: string, headers: Readonly<Record<string, string>>) =>
      fetch(server.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: tool, arguments: {} },
        }),
      }),
  };
}

test('it answers 403 to a request with another host name', async () => {
  const ctx = setupTest();

  const response = await ctx.postToolCall('atc_sessions_list', {
    host: 'elsewhere.test',
    authorization: 'Bearer atcs_test-token-0123',
  });

  expect(response.status).toBe(403);
});

test('it answers 401 to a request with another bearer', async () => {
  const ctx = setupTest();

  const response = await ctx.postToolCall('atc_sessions_list', {
    host: 'atc.test',
    authorization: 'Bearer atcs_other',
  });

  expect(response.status).toBe(401);
});

test('it answers 403 insufficient_scope to a tool outside the scopes', async () => {
  const ctx = setupTest();

  const response = await ctx.postToolCall('atc_session_spawn', {
    host: 'atc.test',
    authorization: 'Bearer atcs_test-token-0123',
  });

  expect([response.status, response.headers.get('www-authenticate')]).toStrictEqual([
    403,
    'Bearer error="insufficient_scope", scope="spawn"',
  ]);
});

test('it answers 502 to a call that the fake atc leaves with no answer', async () => {
  const ctx = setupTest();

  ctx.atc.failNext('atc_sessions_list', { kind: 'no-answer' });

  const response = await ctx.postToolCall('atc_sessions_list', {
    host: 'atc.test',
    authorization: 'Bearer atcs_test-token-0123',
  });

  expect(response.status).toBe(502);
});

test('it answers a JSON-RPC error with the request id to a call that the fake atc fails so', async () => {
  const ctx = setupTest();

  ctx.atc.failNext('atc_sessions_list', { kind: 'rpc-error', code: -32_603 });

  const response = await ctx.postToolCall('atc_sessions_list', {
    host: 'atc.test',
    authorization: 'Bearer atcs_test-token-0123',
  });

  const body: unknown = await response.json();

  expect(body).toStrictEqual({
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32_603, message: 'the fake atc failed the call' },
  });
});
