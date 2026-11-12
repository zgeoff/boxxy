// Copied from atc: packages/mcp/src/http/pick-error-message.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { pickErrorMessage } from './pick-error-message.ts';

test.each([
  [
    'invalid_client',
    'boxxy refused this authorization request: the client is not one added to boxxy.',
  ],
  [
    'invalid_redirect',
    'boxxy refused this authorization request: the redirect URI is not one the client was added with.',
  ],
  ['invalid_request', 'boxxy refused this authorization request: the request is malformed.'],
])('it shows a fixed sentence for the error code %p', (code, message) => {
  expect(pickErrorMessage(code)).toBe(message);
});

test.each([['Your session expired, call +1 555 0100'], ['toString'], ['__proto__'], [null]])(
  'it shows the generic sentence for the error code %p',
  (code) => {
    expect(pickErrorMessage(code)).toBe(
      'boxxy refused this authorization request: the request is not valid.',
    );
  },
);
