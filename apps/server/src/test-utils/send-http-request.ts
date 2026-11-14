import { request } from 'node:http';

export interface HttpAnswer {
  readonly status: number;
  readonly contentType: string;
  readonly text: string;
}

// One request to a listener on a real port, and its whole answer. Lint keeps `fetch` out of an app,
// so the tests of a running listener send through `node:http`.
export async function sendHttpRequest(sent: Request): Promise<HttpAnswer> {
  const body = await sent.text();

  const waiting = Promise.withResolvers<HttpAnswer>();

  const outgoing = request(
    sent.url,
    { method: sent.method, headers: Object.fromEntries(sent.headers) },
    (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        waiting.resolve({
          status: response.statusCode ?? 0,
          contentType: response.headers['content-type'] ?? '',
          text: Buffer.concat(chunks).toString('utf8'),
        });
      });
    },
  );

  outgoing.on('error', waiting.reject);
  outgoing.end(body);

  return waiting.promise;
}
