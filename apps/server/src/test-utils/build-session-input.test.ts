import { expect, test } from 'bun:test';
import { buildSessionInput } from './build-session-input.ts';

test.each([
  ['attempt.current', {}],
  ['attempt.listItems', {}],
  ['attempt.getItem', { item: 'i-1' }],
  ['attempt.evidence', { session: { attempt: 'a-1' }, kind: 'test', ref: 'bun test' }],
  ['attempt.closeOut', { session: { attempt: 'a-1' }, closeOut: {} }],
  [
    'attempt.bindSession',
    {
      session: { attempt: 'a-1', agentSession: 'agent-1', product: 'claude_code' },
      seenAt: '2026-11-01T09:00:00Z',
    },
  ],
  [
    'attempt.recordPullRequest',
    { session: { attempt: 'a-1' }, url: 'https://github.com/example/app/pull/7' },
  ],
])('it builds the input of %s for the attempt', (procedure, input) => {
  expect(buildSessionInput(procedure, 'a-1')).toStrictEqual(input);
});
