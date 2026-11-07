import { expect, test } from 'bun:test';
import { buildMockFactId } from './build-mock-fact-id.ts';

test('it builds a default fact id', () => {
  const built: unknown = buildMockFactId();

  expect(built).toStrictEqual(expect.stringMatching(/^manual:[0-9a-f]{8}-[0-9a-f]{4}-7/u));
});
