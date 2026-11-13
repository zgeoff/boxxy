import { expect, test } from 'bun:test';
import { buildMockRequestError } from './build-mock-request-error.ts';

test('it builds an HttpError with the status and the message', () => {
  expect(buildMockRequestError(404, 'Not Found')).toMatchObject({
    name: 'HttpError',
    status: 404,
    message: 'Not Found',
  });
});
