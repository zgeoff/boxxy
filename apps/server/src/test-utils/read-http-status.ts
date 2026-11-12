import { request } from 'node:http';

// The status that a listener on a real port answers a request with. Lint keeps `fetch` out of an
// app, so the tests of a running server read the status through `node:http`.
export function readHttpStatus(url: string, method: 'GET' | 'POST'): Promise<number> {
  const waiting = Promise.withResolvers<number>();
  const body = method === 'POST' ? '{}' : undefined;

  const sent = request(url, { method }, (response) => {
    response.resume();
    waiting.resolve(response.statusCode ?? 0);
  });

  sent.on('error', waiting.reject);
  sent.end(body);

  return waiting.promise;
}
