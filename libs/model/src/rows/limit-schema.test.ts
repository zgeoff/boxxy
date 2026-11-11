import { expect, test } from 'bun:test';
import { limitSchema } from './limit-schema.ts';

test('it parses a limit with its filter', () => {
  const limit = { name: 'owner-design', max: 1, counts: { designMode: ['attended'] } };
  const parsed: unknown = limitSchema.parse(limit);

  expect(parsed).toStrictEqual(limit);
});

test('it rejects a limit with a negative max', () => {
  expect(() => limitSchema.parse({ name: 'workers', max: -1, counts: {} })).toThrow();
});
