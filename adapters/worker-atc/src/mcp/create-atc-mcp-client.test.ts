import { expect, onTestFinished, test } from 'bun:test';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { createFakeAtcServer } from '../test-utils/create-fake-atc-server.ts';
import type { FakeAtcRequest } from '../test-utils/create-fake-atc-server.ts';
import { createFakeAtc } from '../test-utils/create-fake-atc.ts';
import { AtcCallError } from './atc-call-error.ts';
import { createAtcMcpClient } from './create-atc-mcp-client.ts';

function setupTest() {
  const atc = createFakeAtc({ clock: createFakeClock(), targets: { box: 'suspending' } });

  const server = createFakeAtcServer({
    atc,
    token: 'atcs_test-token-0123456789abcdefghijklmnop',
    host: 'atc.example.test',
  });

  onTestFinished(() => server.stop());

  return {
    atc,
    server,
    makeClient: (input: { readonly token?: string; readonly host?: string | null } = {}) =>
      createAtcMcpClient({
        url: server.url,
        host: input.host === undefined ? 'atc.example.test' : input.host,
        token: input.token ?? 'atcs_test-token-0123456789abcdefghijklmnop',
        fetch,
        timeoutMs: 5000,
      }),

    // the first tool call never answers, and rejects only once the client aborts it
    makeHangingFetch: () => {
      let hung = false;

      return (url: string | URL, init: RequestInit): Promise<Response> => {
        if (hung || typeof init.body !== 'string' || !init.body.includes('"tools/call"')) {
          return fetch(url, init);
        }

        hung = true;

        const pending = Promise.withResolvers<Response>();

        init.signal?.addEventListener('abort', () => {
          pending.reject(new Error('the request was aborted'));
        });

        return pending.promise;
      };
    },
    spawnInput: {
      target: 'box',
      cwd: '/tmp/boxxy-test/repos/widget',
      name: 'boxxy/attempt-1',
      prompt: 'Build the widget.',
      agent: 'claude',
      model: 'example-model',
      effort: 'medium',
      idempotencyKey: 'attempt-1',
    },
  };
}

test('it sends the public host name and the bearer on every request', async () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  await client.listSessions();

  expect(ctx.server.requests).toSatisfyAll(
    (request: FakeAtcRequest) =>
      request.host === 'atc.example.test' &&
      request.authorization === 'Bearer atcs_test-token-0123456789abcdefghijklmnop',
  );
});

test('it reads a session with only the fields boxxy reads', async () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  const spawned = await client.spawnSession(ctx.spawnInput);
  const read = await client.readSession(spawned.id);

  expect(read).toStrictEqual({
    session: {
      id: 's1-fake',
      name: 'boxxy/attempt-1',
      createdAt: expect.any(Number),
      state: 'running',
      agentSessionID: 'agent-1',
      lastAttachedAt: expect.any(Number),
      lifecycle: { desired: 'run', harness: 'running' },
      host: { name: 'imp-s1-fake', id: 'imp-id-s1-fake', issuer: 'https://broker.test' },
    },
    lastActivityAt: expect.any(Number),
  });
});

test('it refuses a wrong token with unauthorized and a message without the token', () => {
  const ctx = setupTest();
  const client = ctx.makeClient({ token: 'atcs_wrong-token-0123456789abcdefghijklmn' });

  expect(client.listSessions()).rejects.toSatisfy(
    (rejection: unknown) =>
      rejection instanceof AtcCallError &&
      rejection.code === 'unauthorized' &&
      !rejection.message.includes('atcs_'),
  );
});

test('it refuses with forbidden when the gateway answers 403 to the host name', () => {
  const ctx = setupTest();
  const client = ctx.makeClient({ host: null });

  expect(client.listSessions()).rejects.toMatchObject({ code: 'forbidden' });
});

test('it refuses with insufficient_scope and the scope name a tool outside the token scopes', () => {
  const ctx = setupTest();

  const server = createFakeAtcServer({
    atc: ctx.atc,
    token: 'atcs_test-token-0123456789abcdefghijklmnop',
    host: 'atc.example.test',
    scopes: ['read', 'message'],
  });

  onTestFinished(() => server.stop());

  const client = createAtcMcpClient({
    url: server.url,
    host: 'atc.example.test',
    token: 'atcs_test-token-0123456789abcdefghijklmnop',
    fetch,
    timeoutMs: 5000,
  });

  expect(client.spawnSession(ctx.spawnInput)).rejects.toMatchObject({
    code: 'insufficient_scope',
    message: 'the atc token lacks the scope "spawn"',
  });
});

test('it refuses a result that fails the tool schema and never returns it', () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  ctx.atc.failNext('atc_sessions_list', {
    kind: 'malformed',
    result: { sessions: [{ id: 's1-fake', state: 'hacked' }] },
  });

  expect(client.listSessions()).rejects.toMatchObject({ code: 'malformed_answer' });
});

test('it rejects with the atc code of a refused call', () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  expect(client.readSession('s9-fake')).rejects.toMatchObject({ code: 'no_such_session' });
});

test('it rejects with an error that is no atc refusal when the gateway gives no answer', () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  ctx.atc.failNext('atc_sessions_list', { kind: 'no-answer' });

  expect(client.listSessions()).rejects.toSatisfy(
    (rejection: unknown) => rejection instanceof Error && !(rejection instanceof AtcCallError),
  );
});

test('it rejects with protocol_error a call atc refuses as invalid params', () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  ctx.atc.failNext('atc_sessions_list', { kind: 'rpc-error', code: -32_602 });

  expect(client.listSessions()).rejects.toMatchObject({ code: 'protocol_error' });
});

test('it rejects with an error that is no atc refusal when atc answers an internal error', () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  ctx.atc.failNext('atc_sessions_list', { kind: 'rpc-error', code: -32_603 });

  expect(client.listSessions()).rejects.toSatisfy(
    (rejection: unknown) => rejection instanceof Error && !(rejection instanceof AtcCallError),
  );
});

test('it answers the next call after a call that got no answer', async () => {
  const ctx = setupTest();
  const client = ctx.makeClient();

  ctx.atc.failNext('atc_sessions_list', { kind: 'no-answer' });

  await client.listSessions().catch(() => null);

  expect(client.listSessions()).resolves.toStrictEqual({ sessions: [] });
});

test('it rejects with an error that is no atc refusal when a call outlasts the timeout', () => {
  const ctx = setupTest();

  const client = createAtcMcpClient({
    url: ctx.server.url,
    host: 'atc.example.test',
    token: 'atcs_test-token-0123456789abcdefghijklmnop',
    fetch: ctx.makeHangingFetch(),
    timeoutMs: 200,
  });

  expect(client.listSessions()).rejects.toSatisfy(
    (rejection: unknown) => rejection instanceof Error && !(rejection instanceof AtcCallError),
  );
});

test('it answers the next call after a call that outlasts the timeout', async () => {
  const ctx = setupTest();

  const client = createAtcMcpClient({
    url: ctx.server.url,
    host: 'atc.example.test',
    token: 'atcs_test-token-0123456789abcdefghijklmnop',
    fetch: ctx.makeHangingFetch(),
    timeoutMs: 200,
  });

  await client.listSessions().catch(() => null);

  expect(client.listSessions()).resolves.toStrictEqual({ sessions: [] });
});

test('it connects again on the next call after a connect fails', async () => {
  const ctx = setupTest();
  let refusals = 1;

  const sendRequest = (url: string | URL, init: RequestInit): Promise<Response> => {
    refusals -= 1;

    return refusals >= 0 ? Promise.reject(new Error('socket closed')) : fetch(url, init);
  };

  const client = createAtcMcpClient({
    url: ctx.server.url,
    host: 'atc.example.test',
    token: 'atcs_test-token-0123456789abcdefghijklmnop',
    fetch: sendRequest,
    timeoutMs: 5000,
  });

  await client.listSessions().catch(() => null);

  expect(client.listSessions()).resolves.toStrictEqual({ sessions: [] });
});
