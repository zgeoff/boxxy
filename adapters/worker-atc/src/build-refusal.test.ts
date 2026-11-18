import { expect, test } from 'bun:test';
import { buildRefusal } from './build-refusal.ts';
import { AtcCallError } from './mcp/atc-call-error.ts';

test('it keeps the code and the problem, and drops the code from the message', () => {
  const error = new AtcCallError(
    'host_unavailable',
    'host_unavailable: not enough pages',
    'ram_budget_exceeded',
  );

  expect(buildRefusal(error)).toStrictEqual({
    code: 'host_unavailable',
    problem: 'ram_budget_exceeded',
    message: 'not enough pages',
  });
});

test('it keeps a message that does not start with the code', () => {
  const error = new AtcCallError('malformed_answer', 'atc answered with an unreadable result');

  expect(buildRefusal(error)).toStrictEqual({
    code: 'malformed_answer',
    problem: null,
    message: 'atc answered with an unreadable result',
  });
});

test('it cuts a message longer than 500 characters', () => {
  const error = new AtcCallError('host_unavailable', `host_unavailable: ${'x'.repeat(900)}`);

  expect(buildRefusal(error).message).toBe('x'.repeat(500));
});
