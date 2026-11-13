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

test.each([
  { header: 'retry-after', value: '60' },
  { header: 'x-ratelimit-remaining', value: '0' },
])('it finds no reason in a 403 whose $header header marks a rate limit', (row) => {
  const error = Object.assign(buildMockRequestError(403, 'Forbidden'), {
    response: { headers: { [row.header]: row.value } },
  });

  expect(findForgeRefusal(error)).toBeNull();
});

test('it finds the reason in a 403 with requests left in the window', () => {
  const error = Object.assign(
    buildMockRequestError(403, 'Resource not accessible by integration'),
    {
      response: { headers: { 'x-ratelimit-remaining': '4999' } },
    },
  );

  expect(findForgeRefusal(error)).toBe(
    'GitHub answered 403 to the noslop App: Resource not accessible by integration',
  );
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
