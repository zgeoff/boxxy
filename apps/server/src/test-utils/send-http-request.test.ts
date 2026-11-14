import { expect, onTestFinished, test } from 'bun:test';
import { sendHttpRequest } from './send-http-request.ts';

// A listener that answers each request with its method, its `x-shelf` header and its body.
function setupTest() {
  const listener = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
      '/echo': async (request) =>
        Response.json(
          {
            method: request.method,
            shelf: request.headers.get('x-shelf'),
            body: await request.text(),
          },
          { status: 201 },
        ),
    },
  });

  onTestFinished(() => listener.stop(true));

  return { origin: `http://127.0.0.1:${String(listener.port)}` };
}

test('it sends the method, the headers and the body, and gives the whole answer', async () => {
  const ctx = setupTest();

  const answer = await sendHttpRequest(
    new Request(`${ctx.origin}/echo`, {
      method: 'POST',
      headers: { 'x-shelf': 'top' },
      body: 'three jars',
    }),
  );

  expect(answer).toStrictEqual({
    status: 201,
    contentType: expect.stringMatching(/^application\/json/u),
    text: '{"method":"POST","shelf":"top","body":"three jars"}',
  });
});

test('it sends a GET with no body', async () => {
  const ctx = setupTest();

  const answer = await sendHttpRequest(new Request(`${ctx.origin}/echo`));

  expect(answer.text).toBe('{"method":"GET","shelf":null,"body":""}');
});
