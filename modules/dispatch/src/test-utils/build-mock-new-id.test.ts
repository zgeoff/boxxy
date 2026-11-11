import { expect, test } from 'bun:test';
import { buildMockNewId } from './build-mock-new-id.ts';

test('it gives the next version 7 UUID on each call', () => {
  const newId = buildMockNewId();
  const ids = [newId(), newId()];

  expect(ids).toStrictEqual([
    '0190a6f4-0000-7000-8000-000000000001',
    '0190a6f4-0000-7000-8000-000000000002',
  ]);
});
