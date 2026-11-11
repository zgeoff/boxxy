import { expect, test } from 'bun:test';
import { readLimitedRequest } from './read-limited-request.ts';

test('it gives back a body at the limit whole', async () => {
  const request = new Request('http://boxxy.test/rpc', { method: 'POST', body: 'x'.repeat(10) });

  const limited = await readLimitedRequest(request, 10);
  const text = await limited?.text();

  expect(text).toBe('x'.repeat(10));
});

test('it refuses a declared length over the limit', async () => {
  const request = new Request('http://boxxy.test/rpc', {
    method: 'POST',
    headers: { 'content-length': '11' },
    body: 'x'.repeat(11),
  });

  const limited = await readLimitedRequest(request, 10);

  expect(limited).toBeNull();
});

test('it refuses a streamed body over the limit that declares no length', async () => {
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new Uint8Array(4));
      controller.enqueue(new Uint8Array(4));
      controller.enqueue(new Uint8Array(4));
      controller.close();
    },
  });

  const request = new Request('http://boxxy.test/rpc', { method: 'POST', body });

  const limited = await readLimitedRequest(request, 10);

  expect(limited).toBeNull();
});

test('it keeps a request with no body', async () => {
  const request = new Request('http://boxxy.test/healthz');

  const limited = await readLimitedRequest(request, 10);

  expect(limited).toBe(request);
});
