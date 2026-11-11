import { expect, test } from 'bun:test';
import { criterionSchema } from './criterion-schema.ts';

test('it accepts a criterion with the evidence that meets it', () => {
  const criterion = {
    id: 'a2',
    text: 'The button sends the upload again',
    evidence: ['0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a'],
  };

  const parsed: unknown = criterionSchema.safeParse(criterion).data;

  expect(parsed).toStrictEqual(criterion);
});

test('it rejects a criterion id that does not start with a', () => {
  const criterion = { id: 'b1', text: 'The button sends the upload again', evidence: [] };

  expect(criterionSchema.safeParse(criterion).error?.issues).toPartiallyContain({ path: ['id'] });
});
