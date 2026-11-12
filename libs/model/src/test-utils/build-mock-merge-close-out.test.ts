import { expect, test } from 'bun:test';
import { mergeCloseOutSchema } from '../closeouts/merge-close-out-schema.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockMergeCloseOut } from './build-mock-merge-close-out.ts';

test('it builds a merge close-out that the merge close-out schema accepts', () => {
  const closeOut = buildMockMergeCloseOut();
  const parsed: unknown = mergeCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it reads the verify reading at the head it is given', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  expect(buildMockMergeCloseOut({ head }).verify).toStrictEqual({ status: 'not-covered', head });
});
