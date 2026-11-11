import { expect, test } from 'bun:test';
import { buildTokenDigest, pickRequestScope } from './pick-request-scope.ts';

test.each([
  ['owner', null, 'owner'],
  ['worker', null, null],
  ['owner', 'Bearer worker-token-1', 'worker'],
  ['worker', 'Bearer worker-token-1', 'worker'],
  ['owner', 'Bearer worker-token-2', null],
  ['worker', 'Bearer worker-token-2', null],
  ['owner', 'Basic worker-token-1', null],
  ['owner', 'Bearer ', null],
  ['worker', 'Bearer worker-token-1 extra', null],
] as const)(
  'it gives a request on the %s listener with authorization %p the scope %p',
  (listener, authorization, scope) => {
    const workerTokenDigest = buildTokenDigest('worker-token-1');

    expect(pickRequestScope({ listener, authorization, workerTokenDigest })).toBe(scope);
  },
);

test('#buildTokenDigest gives a 32-byte digest', () => {
  expect(buildTokenDigest('worker-token-1')).toHaveLength(32);
});
