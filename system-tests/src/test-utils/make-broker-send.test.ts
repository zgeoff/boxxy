import { expect, test } from 'bun:test';
import { buildRPCRequest } from '@boxxy/server/test-utils/build-rpc-request';
import { makeBrokerSend } from './make-broker-send.ts';

function setupTest() {
  const seen: { listener: string; authorization: string | null; url: string }[] = [];

  const answer = (listener: string) => (request: Request) => {
    seen.push({
      listener,
      authorization: request.headers.get('authorization'),
      url: new URL(request.url).pathname,
    });

    return Promise.resolve(new Response('ok'));
  };

  const send = makeBrokerSend({
    owner: answer('owner'),
    worker: answer('worker'),
    workerToken: 'token-1',
  });

  return { seen, send };
}

test('#makeBrokerSend sends an owner procedure to the owner listener with no token', async () => {
  const ctx = setupTest();

  await ctx.send(buildRPCRequest({ procedure: 'runner.status', input: {} }));

  expect(ctx.seen).toStrictEqual([
    { listener: 'owner', authorization: null, url: '/rpc/runner/status' },
  ]);
});

test('#makeBrokerSend sends a session procedure to the worker listener with the worker token', async () => {
  const ctx = setupTest();

  await ctx.send(buildRPCRequest({ procedure: 'attempt.current', input: {} }));

  expect(ctx.seen).toStrictEqual([
    { listener: 'worker', authorization: 'Bearer token-1', url: '/rpc/attempt/current' },
  ]);
});

test('#makeBrokerSend sends a path that is no procedure to the owner listener', async () => {
  const ctx = setupTest();

  await ctx.send(new Request('http://boxxy.test/elsewhere'));

  expect(ctx.seen.map((call) => call.listener)).toStrictEqual(['owner']);
});
