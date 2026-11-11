import { expect, test } from 'bun:test';
import { attemptRowSchema } from '../rows/attempt-row-schema.ts';
import { buildMockV1AttemptRow } from './build-mock-v1-attempt-row.ts';

test('it builds an attempt row that the row schema accepts', () => {
  const built = buildMockV1AttemptRow();

  expect(attemptRowSchema.safeParse(built).data).toStrictEqual(built);
});

test('it applies overrides on top of the defaults', () => {
  const attempt = buildMockV1AttemptRow({ state: 'sleeping', holdGen: 3 });

  expect(attempt).toStrictEqual(expect.objectContaining({ state: 'sleeping', holdGen: 3 }));
});
