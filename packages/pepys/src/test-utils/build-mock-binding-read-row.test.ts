import { expect, test } from 'bun:test';
import { buildMockBindingReadRow } from './build-mock-binding-read-row.ts';

test('it builds a binding whose caller is the default telemetry origin', () => {
  const row = buildMockBindingReadRow();

  expect([row.caller_issuer, row.caller_subject]).toStrictEqual([
    'https://broker.example',
    'imp-builder',
  ]);
});

test('it keeps an override', () => {
  expect(buildMockBindingReadRow({ caller_issuer: null }).caller_issuer).toBeNull();
});
