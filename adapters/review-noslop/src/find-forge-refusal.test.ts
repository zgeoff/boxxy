import { expect, test } from 'bun:test';
import { findForgeRefusal } from './find-forge-refusal.ts';
import { buildMockRequestError } from './test-utils/build-mock-request-error.ts';

test.each([
  { status: 401, message: 'Bad credentials' },
  { status: 404, message: 'Not Found' },
  { status: 422, message: 'Validation Failed' },
])('it finds the reason in a $status answer', (row) => {
  const error = buildMockRequestError(row.status, row.message);

  expect(findForgeRefusal(error)).toBe(
    `GitHub answered ${row.status} to the noslop App: ${row.message}`,
  );
});

test.each([
  { status: 500, message: 'fetch failed' },
  { status: 502, message: 'Bad Gateway' },
  { status: 429, message: 'Too Many Requests' },
  { status: 403, message: 'You have exceeded a secondary rate limit' },
])('it finds no reason in a $status answer that a later send can pass', (row) => {
  const error = buildMockRequestError(row.status, row.message);

  expect(findForgeRefusal(error)).toBeNull();
});

test('it finds the status in the cause of the error noslop wraps', () => {
  const error = new Error(
    'noslop posts only a verified result, so it refuses this one: Not Found',
    {
      cause: buildMockRequestError(404, 'Not Found'),
    },
  );

  expect(findForgeRefusal(error)).toBe(
    'GitHub answered 404 to the noslop App: noslop posts only a verified result, so it refuses this one: Not Found',
  );
});

test('it finds no reason in an error with no HTTP status', () => {
  const error = new Error('fetch failed', { cause: new Error('ECONNRESET') });

  expect(findForgeRefusal(error)).toBeNull();
});
