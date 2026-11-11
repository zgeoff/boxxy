import { expect, test } from 'bun:test';
import { attemptSessionRowSchema } from './attempt-session-row-schema.ts';

test('it accepts a session that the hook bound', () => {
  const row = {
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    agentSession: 'agent-7f3a',
    atcSession: 'sess-01',
    product: 'claude_code',
    source: 'hook',
    seenAt: 2500,
  };

  const parsed: unknown = attemptSessionRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a session from a source other than the worker or the hook', () => {
  expect(attemptSessionRowSchema.safeParse({ source: 'owner' }).error?.issues).toPartiallyContain({
    path: ['source'],
  });
});
