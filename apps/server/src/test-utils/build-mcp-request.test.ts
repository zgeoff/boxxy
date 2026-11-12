import { expect, test } from 'bun:test';
import { buildMCPRequest } from './build-mcp-request.ts';

test('it posts one JSON-RPC request to the endpoint with the bearer token', async () => {
  const request = buildMCPRequest({
    path: '/mcp/session',
    method: 'tools/list',
    params: {},
    token: 'token-1',
  });

  expect({
    url: request.url,
    accept: request.headers.get('accept'),
    authorization: request.headers.get('authorization'),
    body: await request.json(),
  }).toStrictEqual({
    url: 'http://boxxy.test/mcp/session',
    accept: 'application/json, text/event-stream',
    authorization: 'Bearer token-1',
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
});

test('it sends no authorization header with no token', () => {
  const request = buildMCPRequest({ path: '/mcp', method: 'tools/list', params: {} });

  expect(request.headers.get('authorization')).toBeNull();
});

test('it sends the host of a given origin', () => {
  const request = buildMCPRequest({
    path: '/mcp',
    method: 'tools/list',
    params: {},
    origin: 'https://boxxy.test',
  });

  expect({ url: request.url, host: request.headers.get('host') }).toStrictEqual({
    url: 'https://boxxy.test/mcp',
    host: 'boxxy.test',
  });
});
