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

test('it reads a refusal as the structured code and problem, with the text as the message', () => {
  const parsed = parseToolResult(
    'atc_session_spawn',
    {
      isError: true,
      content: [{ type: 'text', text: 'host_unavailable: no RAM for another machine' }],
      structuredContent: { code: 'host_unavailable', problem: 'ram_budget_exceeded' },
    },
    z.object({}),
  );

  expect(parsed).toStrictEqual({
    kind: 'refused',
    error: new AtcCallError(
      'host_unavailable',
      'host_unavailable: no RAM for another machine',
      'ram_budget_exceeded',
    ),
  });
});

test('it reads a refusal with no problem with a null problem', () => {
  const parsed = parseToolResult(
    'atc_session_get',
    {
      isError: true,
      content: [{ type: 'text', text: 'no_such_session: no session s9' }],
      structuredContent: { code: 'no_such_session' },
    },
    z.object({}),
  );

  expect(parsed).toMatchObject({
    kind: 'refused',
    error: { code: 'no_such_session', problem: null },
  });
});

test.each([
  ['no structured content', undefined],
  ['a code that is no atc code', { code: 'No Such Session' }],
  ['a problem that is no atc code', { code: 'host_unavailable', problem: 'x'.repeat(100) }],
])(
  'it reads a refusal with %s as refused, and never reads the code from the text',
  (_title, structured) => {
    const parsed = parseToolResult(
      'atc_session_get',
      {
        isError: true,
        content: [{ type: 'text', text: 'no_such_session: no session s9' }],
        structuredContent: structured,
      },
      z.object({}),
    );

    expect(parsed).toMatchObject({ kind: 'refused', error: { code: 'refused', problem: null } });
  },
);

test('it cuts a long refusal message to 500 characters', () => {
  const parsed = parseToolResult(
    'atc_session_get',
    {
      isError: true,
      content: [{ type: 'text', text: 'x'.repeat(2000) }],
      structuredContent: { code: 'bad_args' },
    },
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
