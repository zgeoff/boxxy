import { expect, test } from 'bun:test';
import { readMCPAnswer } from './read-mcp-answer.ts';

test('it reads the answer from the event of a stream', async () => {
  const response = new Response(
    'event: message\ndata: {"result":{"tools":[]},"jsonrpc":"2.0","id":1}\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );

  const answer = await readMCPAnswer(response);

  expect(answer).toStrictEqual({ result: { tools: [] }, jsonrpc: '2.0', id: 1 });
});

test('it reads the answer from a JSON body', async () => {
  const response = Response.json({
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32_602, message: 'Tool item_get not found' },
  });

  const answer = await readMCPAnswer(response);

  expect(answer).toStrictEqual({
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32_602, message: 'Tool item_get not found' },
  });
});
