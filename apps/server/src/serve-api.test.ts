import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildMCPRequest } from './test-utils/build-mcp-request.ts';
import { buildRPCRequest } from './test-utils/build-rpc-request.ts';
import { createTestServer } from './test-utils/create-test-server.ts';
import { listOwnerProcedures, listOwnerTools } from './test-utils/list-owner-procedures.ts';
import { readMCPAnswer } from './test-utils/read-mcp-answer.ts';

async function setupTest() {
  const server = await createTestServer();

  return {
    ...server,

    // the tools that an MCP endpoint lists, with each one's schemas as JSON
    listTools: async (listener: 'owner' | 'worker', path: '/mcp' | '/mcp/session') => {
      const token = listener === 'worker' ? server.workerToken : undefined;

      const response = await server[listener](
        buildMCPRequest({
          path,
          method: 'tools/list',
          params: {},
          ...(token === undefined ? {} : { token }),
        }),
      );

      const answer = await readMCPAnswer(response);

      return z
        .array(
          z
            .object({ name: z.string(), inputSchema: z.unknown(), outputSchema: z.unknown() })
            .loose(),
        )
        .parse(answer.result?.['tools']);
    },
  };
}

test.each([['/rpc/item/list'], ['/mcp/session'], ['/healthz'], ['/no-such-path']])(
  'it answers 401 on the worker listener for %s with no token',
  async (path) => {
    const ctx = await setupTest();
    const response = await ctx.worker(new Request(`http://boxxy.test${path}`, { method: 'POST' }));
    const body = await response.json();

    expect({ status: response.status, body }).toStrictEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
  },
);

test.each([
  ['owner', '/rpc/item/list'],
  ['owner', '/mcp'],
  ['worker', '/rpc/item/list'],
  ['worker', '/mcp/session'],
] as const)(
  'it answers 401 on the %s listener for %s with a wrong token',
  async (listener, path) => {
    const ctx = await setupTest();

    const request = new Request(`http://boxxy.test${path}`, {
      method: 'POST',
      headers: { authorization: 'Bearer not-the-worker-token' },
    });

    const response = await ctx[listener](request);
    const body = await response.json();

    expect({ status: response.status, body }).toStrictEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
  },
);

test('it answers 401 for an authorization header that is not a bearer token', async () => {
  const ctx = await setupTest();

  const request = new Request('http://boxxy.test/rpc/item/list', {
    method: 'POST',
    headers: { authorization: `Basic ${ctx.workerToken}` },
  });

  const response = await ctx.owner(request);

  expect(response.status).toBe(401);
});

test.each([
  [
    'a cross-site text/plain POST',
    '/rpc/runner/pause',
    {
      method: 'POST',
      headers: { origin: 'https://stranger.example', 'content-type': 'text/plain' },
      body: '{"json":{}}',
    },
  ],
  [
    'a POST from a page whose name points at the server',
    '/rpc/runner/pause',
    {
      method: 'POST',
      headers: {
        origin: 'http://boxxy.test',
        'sec-fetch-site': 'same-origin',
        'content-type': 'text/plain',
      },
      body: '{"json":{}}',
    },
  ],
  [
    'a cross-site GET',
    '/rpc/runner/pause?data=%7B%22json%22%3A%7B%7D%7D',
    { headers: { 'sec-fetch-site': 'cross-site' } },
  ],
] as const)(
  'it refuses %s on the owner listener and leaves the runner running',
  async (_name, path, init) => {
    const ctx = await setupTest();
    const response = await ctx.owner(new Request(`http://boxxy.test${path}`, init));
    const status = await ctx.owner(buildRPCRequest({ procedure: 'runner.status', input: {} }));
    const statusJSON: unknown = await status.json();

    const statusBody = z
      .object({ json: z.object({ paused: z.boolean() }).loose() })
      .parse(statusJSON);

    expect([response.status, statusBody.json.paused]).toStrictEqual([403, false]);
  },
);

test('it refuses an MCP call from a browser page on /mcp', async () => {
  const ctx = await setupTest();

  const request = buildMCPRequest({ path: '/mcp', method: 'tools/list', params: {} });

  request.headers.set('origin', 'https://stranger.example');

  const response = await ctx.owner(request);

  expect(response.status).toBe(403);
});

test('it refuses a browser page on the worker listener even with the token', async () => {
  const ctx = await setupTest();

  const request = buildMCPRequest({
    path: '/mcp/session',
    method: 'tools/list',
    params: {},
    token: ctx.workerToken,
  });

  request.headers.set('sec-fetch-site', 'cross-site');

  const response = await ctx.worker(request);

  expect(response.status).toBe(403);
});

test('it serves the health check on the owner listener', async () => {
  const ctx = await setupTest();
  const response = await ctx.owner(new Request('http://boxxy.test/healthz'));
  const body = await response.text();

  expect({ status: response.status, body }).toStrictEqual({ status: 200, body: 'ok' });
});

test.each([['/healthz'], ['/mcp']])(
  'it serves no %s on the worker listener, even with the token',
  async (path) => {
    const ctx = await setupTest();

    const response = await ctx.worker(
      new Request(`http://boxxy.test${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ctx.workerToken}` },
      }),
    );

    expect(response.status).toBe(404);
  },
);

test('it answers 413 for a request that declares a body over 256 KiB', async () => {
  const ctx = await setupTest();

  const request = new Request('http://boxxy.test/rpc/item/list', {
    method: 'POST',
    headers: { 'content-length': String(256 * 1024 + 1) },
    body: 'x'.repeat(256 * 1024 + 1),
  });

  const response = await ctx.owner(request);

  expect(response.status).toBe(413);
});

test('it answers 413 for a streamed body over 256 KiB that declares no length', async () => {
  const ctx = await setupTest();

  const chunk = new Uint8Array(64 * 1024);

  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (let sent = 0; sent < 5; sent += 1) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });

  const response = await ctx.owner(
    new Request('http://boxxy.test/rpc/item/list', { method: 'POST', body }),
  );

  expect(response.status).toBe(413);
});

test('it answers 413 for a streamed body over 256 KiB on the health check', async () => {
  const ctx = await setupTest();

  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new Uint8Array(256 * 1024 + 1));
      controller.close();
    },
  });

  // a GET with a body: no fetch client sends one, but a raw HTTP client can
  const init: RequestInit = { body };

  const response = await ctx.owner(new Request('http://boxxy.test/healthz', init));

  expect(response.status).toBe(413);
});

test('it serves an owner procedure on the owner listener with no token', async () => {
  const ctx = await setupTest();
  const response = await ctx.owner(buildRPCRequest({ procedure: 'item.list', input: {} }));
  const body = await response.json();

  expect({ status: response.status, body }).toStrictEqual({
    status: 200,
    body: { json: { items: [], next: null } },
  });
});

test.each(listOwnerProcedures())(
  'it refuses the worker token on %s through the worker listener with FORBIDDEN',
  async (procedure) => {
    const ctx = await setupTest();

    const response = await ctx.worker(
      buildRPCRequest({ procedure, input: {}, token: ctx.workerToken }),
    );

    const body = await response.json();

    expect({ status: response.status, body }).toStrictEqual({
      status: 403,
      body: { json: { defined: false, code: 'FORBIDDEN', message: 'Forbidden' } },
    });
  },
);

test.each(listOwnerProcedures())(
  'it refuses the worker token on %s through the owner listener with FORBIDDEN',
  async (procedure) => {
    const ctx = await setupTest();

    const response = await ctx.owner(
      buildRPCRequest({ procedure, input: {}, token: ctx.workerToken }),
    );

    const body = await response.json();

    expect({ status: response.status, body }).toStrictEqual({
      status: 403,
      body: { json: { defined: false, code: 'FORBIDDEN', message: 'Forbidden' } },
    });
  },
);

test.each(listOwnerTools())(
  'it refuses the worker token on the owner tool %s on /mcp with FORBIDDEN',
  async (name) => {
    const ctx = await setupTest();

    const response = await ctx.owner(
      buildMCPRequest({
        path: '/mcp',
        method: 'tools/call',
        params: { name, arguments: {} },
        token: ctx.workerToken,
      }),
    );

    const answer = await readMCPAnswer(response);

    expect(answer).toStrictEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          { type: 'text', text: '{"defined":false,"code":"FORBIDDEN","message":"Forbidden"}' },
        ],
        isError: true,
      },
    });
  },
);

test.each(listOwnerTools())(
  'it answers the owner tool %s on /mcp/session as a tool that does not exist',
  async (name) => {
    const ctx = await setupTest();

    const response = await ctx.worker(
      buildMCPRequest({
        path: '/mcp/session',
        method: 'tools/call',
        params: { name, arguments: {} },
        token: ctx.workerToken,
      }),
    );

    const answer = await readMCPAnswer(response);

    expect(answer.error).toStrictEqual({ code: -32_602, message: `Tool ${name} not found` });
  },
);

test('it lists the 20 owner tools on /mcp', async () => {
  const ctx = await setupTest();
  const tools = await ctx.listTools('owner', '/mcp');

  expect(tools.map((tool) => [tool.name])).toIncludeSameMembers(listOwnerTools());
});

test('it lists only the three session tools on /mcp/session', async () => {
  const ctx = await setupTest();
  const tools = await ctx.listTools('worker', '/mcp/session');

  expect(tools.map((tool) => tool.name).toSorted()).toStrictEqual([
    'attempt_close_out',
    'attempt_current',
    'attempt_evidence',
  ]);
});

test('it answers PEPYS_UNAVAILABLE on the oRPC route with status 503', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  ctx.pepys.failNext('pepys did not answer');

  const response = await ctx.owner(buildRPCRequest({ procedure: 'report.cost', input: { item } }));
  const body = await response.json();

  expect({ status: response.status, body }).toStrictEqual({
    status: 503,
    body: {
      json: {
        defined: true,
        code: 'PEPYS_UNAVAILABLE',
        message: expect.any(String),
        data: { reason: 'pepys did not answer' },
      },
    },
  });
});

test('it answers PEPYS_UNAVAILABLE on /mcp as a tool error with status 200', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  ctx.pepys.failNext('pepys did not answer');

  const response = await ctx.owner(
    buildMCPRequest({
      path: '/mcp',
      method: 'tools/call',
      params: { name: 'report_cost', arguments: { item } },
    }),
  );

  const answer = await readMCPAnswer(response);

  expect({ status: response.status, answer }).toStrictEqual({
    status: 200,
    answer: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: expect.stringContaining('"code":"PEPYS_UNAVAILABLE"') }],
        isError: true,
      },
    },
  });
});

test('it gives the unknown close-out body a schema property with no type', async () => {
  const ctx = await setupTest();
  const tools = await ctx.listTools('worker', '/mcp/session');

  const closeOut = tools.find((tool) => tool.name === 'attempt_close_out');

  const schema = z
    .object({ properties: z.object({ closeOut: z.unknown() }).loose() })
    .loose()
    .parse(closeOut?.inputSchema);

  expect(schema.properties.closeOut).toStrictEqual({
    description: 'The close-out body. Get its schema from attempt_current.',
  });
});

test('it gives the discriminated union of attempt_current one schema branch per kind', async () => {
  const ctx = await setupTest();
  const tools = await ctx.listTools('worker', '/mcp/session');

  const current = tools.find((tool) => tool.name === 'attempt_current');

  const schema = z
    .object({ oneOf: z.array(z.unknown()) })
    .loose()
    .parse(current?.outputSchema);

  expect(schema.oneOf).toBeArrayOfSize(2);
});

test('it gives the item view of item_get, a schema typed as a core type, an object schema', async () => {
  const ctx = await setupTest();

  const objectSchema = z.object({ properties: z.record(z.string(), z.unknown()) }).loose();

  const tools = await ctx.listTools('owner', '/mcp');

  const get = tools.find((tool) => tool.name === 'item_get');
  const detail = objectSchema.parse(get?.outputSchema);
  const view = objectSchema.parse(detail.properties['item']);

  expect(Object.keys(view.properties)).toIncludeAllMembers(['id', 'title', 'derived', 'position']);
});
