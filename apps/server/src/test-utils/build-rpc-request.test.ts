import { expect, test } from 'bun:test';
import { buildRPCRequest } from './build-rpc-request.ts';

test('it posts the input to the path of the procedure with the bearer token', async () => {
  const request = buildRPCRequest({
    procedure: 'item.get',
    input: { item: 'i-1' },
    token: 'token-1',
  });

  expect({
    method: request.method,
    url: request.url,
    authorization: request.headers.get('authorization'),
    body: await request.json(),
  }).toStrictEqual({
    method: 'POST',
    url: 'http://boxxy.test/rpc/item/get',
    authorization: 'Bearer token-1',
    body: { json: { item: 'i-1' } },
  });
});

test('it sends no authorization header with no token', () => {
  const request = buildRPCRequest({ procedure: 'item.list', input: {} });

  expect(request.headers.get('authorization')).toBeNull();
});
