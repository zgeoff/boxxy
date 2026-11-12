import { expect, test } from 'bun:test';
import { z } from 'zod';
import { AtcCallError } from './atc-call-error.ts';
import { parseToolResult } from './parse-tool-result.ts';

test('it answers the structured result that the schema reads', () => {
  const parsed = parseToolResult(
    'atc_session_stop',
    { content: [], structuredContent: { stopped: true, extra: 'dropped' } },
    z.object({ stopped: z.boolean() }),
  );

  expect(parsed).toStrictEqual({ kind: 'answered', value: { stopped: true } });
});

test('it reads a refusal as the code and the message atc wrote', () => {
  const parsed = parseToolResult(
    'atc_session_get',
    { isError: true, content: [{ type: 'text', text: 'no_such_session: no session s9' }] },
    z.object({}),
  );

  expect(parsed).toStrictEqual({
    kind: 'refused',
    error: new AtcCallError('no_such_session', 'no session s9'),
  });
});

test('it reads a refusal with no code as refused with its text', () => {
  const parsed = parseToolResult(
    'atc_session_get',
    { isError: true, content: [{ type: 'text', text: 'Something Broke' }] },
    z.object({}),
  );

  expect(parsed).toMatchObject({ kind: 'refused', error: { code: 'refused' } });
});

test('it cuts a long refusal message to 500 characters', () => {
  const parsed = parseToolResult(
    'atc_session_get',
    { isError: true, content: [{ type: 'text', text: `bad_args: ${'x'.repeat(2000)}` }] },
    z.object({}),
  );

  expect(parsed).toMatchObject({ kind: 'refused', error: { message: 'x'.repeat(500) } });
});

test.each([
  ['a result with no structured content', { content: [] }],
  ['a structured result that fails the schema', { structuredContent: { stopped: 'yes' } }],
  ['a value that is no tool result', 'stopped'],
])('it refuses %s as malformed', (_title, result) => {
  const parsed = parseToolResult('atc_session_stop', result, z.object({ stopped: z.boolean() }));

  expect(parsed).toMatchObject({ kind: 'refused', error: { code: 'malformed_answer' } });
});
