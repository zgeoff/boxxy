import { expect, test } from 'bun:test';
import { itemRevisionSchema } from './item-revision-schema.ts';

test('it accepts an edit by the owner that set two fields', () => {
  const revision = { seq: 4, at: 1000, actor: 'boxxy:owner:local', changed: ['body', 'title'] };
  const parsed: unknown = itemRevisionSchema.safeParse(revision).data;

  expect(parsed).toStrictEqual(revision);
});

test('it rejects an actor that is no actor reference', () => {
  const revision = { seq: 4, at: 1000, actor: 'someone', changed: [] };

  expect(itemRevisionSchema.safeParse(revision).error?.issues).toPartiallyContain({
    path: ['actor'],
  });
});
