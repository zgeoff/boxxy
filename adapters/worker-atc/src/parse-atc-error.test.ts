import { expect, test } from 'bun:test';
import { parseAtcError } from './parse-atc-error.ts';
import { FakeAtcError } from './test-utils/create-fake-atc-client.ts';

test('it reads the code, the problem and the message of an atc refusal', () => {
  const error = new FakeAtcError('host_unavailable', { provider: 'imp', problem: 'busy' });

  expect(parseAtcError(error)).toStrictEqual({
    code: 'host_unavailable',
    problem: 'busy',
    message: 'atc refused the call: host_unavailable',
  });
});

test('it reads a refusal with no data as having no problem', () => {
  expect(parseAtcError(new FakeAtcError('session_live'))).toMatchObject({ problem: null });
});

test.each([
  ['an error with no code', new Error('socket closed')],
  [
    'an error with a code atc does not have',
    Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
  ],
  ['a value that is no error', 'socket closed'],
])('it answers null for %s', (_case, error) => {
  expect(parseAtcError(error)).toBeNull();
});
