import { expect, test } from 'bun:test';
import { relationRowSchema } from './relation-row-schema.ts';

test('it accepts a removed relation', () => {
  const row = {
    source: '0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30',
    target: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    type: 'duplicate-of',
    addedBy: 'boxxy:attempt:0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    addedAt: 1000,
    removedAt: 2000,
  };

  const parsed: unknown = relationRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a relation with no type', () => {
  expect(relationRowSchema.safeParse({ type: '' }).error?.issues).toPartiallyContain({
    path: ['type'],
  });
});
