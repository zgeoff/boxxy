import { expect, test } from 'bun:test';
import { openItemSchema } from './open-item-schema.ts';

test('it accepts an issue with a title and a body', () => {
  const item = { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' };
  const parsed: unknown = openItemSchema.safeParse(item).data;

  expect(parsed).toStrictEqual(item);
});

test('it rejects an open item of another kind', () => {
  const item = { kind: 'core.epic', title: 'Uploads', body: '' };

  expect(openItemSchema.safeParse(item).error?.issues).toPartiallyContain({ path: ['kind'] });
});
