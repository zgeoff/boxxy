import { expect, onTestFinished, test } from 'bun:test';
import { readHttpStatus } from './read-http-status.ts';

test('it reads the status that a listener answers with', async () => {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': {
        GET: () => new Response(null, { status: 204 }),
        POST: () => new Response(null, { status: 201 }),
      },
    },
  });

  onTestFinished(() => server.stop(true));

  const url = `http://127.0.0.1:${server.port}/`;

  const statuses = await Promise.all([readHttpStatus(url, 'GET'), readHttpStatus(url, 'POST')]);

  expect(statuses).toStrictEqual([204, 201]);
});
