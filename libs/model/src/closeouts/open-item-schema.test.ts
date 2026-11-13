import { expect, test } from 'bun:test';
import { openItemSchema } from './open-item-schema.ts';

test('it accepts an issue with a title and a body', () => {
  const item = { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' };
  const parsed: unknown = openItemSchema.safeParse(item).data;

  expect(parsed).toStrictEqual(item);
});

test('it accepts an open item of another kind with the security mark', () => {
  const item = { kind: 'core.bug', title: 'Escape the upload name', body: '', security: true };
  const parsed: unknown = openItemSchema.safeParse(item).data;

  expect(parsed).toStrictEqual(item);
});

test('it rejects a security mark that is not a boolean', () => {
  const item = { kind: 'core.issue', title: 'Uploads', body: '', security: 'yes' };

  expect(openItemSchema.safeParse(item).error?.issues).toPartiallyContain({
    path: ['security'],
  });
});
