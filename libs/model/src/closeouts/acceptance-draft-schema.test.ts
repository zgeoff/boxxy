import { expect, test } from 'bun:test';
import { acceptanceDraftSchema } from './acceptance-draft-schema.ts';

test('it accepts a list of criteria with their text', () => {
  const acceptance = [{ text: 'A failed upload retries once' }, { text: 'The retry is logged' }];
  const parsed: unknown = acceptanceDraftSchema.safeParse(acceptance).data;

  expect(parsed).toStrictEqual(acceptance);
});

test('it rejects a criterion with empty text', () => {
  expect(acceptanceDraftSchema.safeParse([{ text: '' }]).error?.issues).toPartiallyContain({
    path: [0, 'text'],
  });
});
