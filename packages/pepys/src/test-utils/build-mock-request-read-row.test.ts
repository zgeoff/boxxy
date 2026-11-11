import { expect, test } from 'bun:test';
import { buildMockBindingReadRow } from './build-mock-binding-read-row.ts';
import { buildMockRequestReadRow } from './build-mock-request-read-row.ts';

test('it builds a request whose origin is the caller of the default binding', () => {
  const request = buildMockRequestReadRow();
  const binding = buildMockBindingReadRow();

  expect([request.session_id, request.origin_issuer, request.origin_subject]).toStrictEqual([
    binding.session_id,
    binding.caller_issuer,
    binding.caller_subject,
  ]);
});

test('it keeps an override', () => {
  expect(buildMockRequestReadRow({ cost_usd: null }).cost_usd).toBeNull();
});
