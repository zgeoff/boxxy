import { expect, test } from 'bun:test';
import { noteRowSchema } from './note-row-schema.ts';

test('it accepts the first note of an item', () => {
  const row = {
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    seq: 1,
    text: 'Keep the old button until the next release',
    by: 'boxxy:owner:local',
    at: 1000,
  };

  const parsed: unknown = noteRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects an empty note', () => {
  expect(noteRowSchema.safeParse({ text: '' }).error?.issues).toPartiallyContain({
    path: ['text'],
  });
});
