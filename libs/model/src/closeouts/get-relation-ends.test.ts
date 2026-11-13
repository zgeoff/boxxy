import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { getRelationEnds } from './get-relation-ends.ts';

test('it reads a draft with a target as a relation from the item to the target', () => {
  const item = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');
  const type = brandSchemas.relationTypeName.parse('blocks');

  expect(getRelationEnds({ type, target: other }, item)).toStrictEqual({
    source: item,
    target: other,
    other,
  });
});

test('it reads a draft with a source as a relation from the source to the item', () => {
  const item = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');
  const type = brandSchemas.relationTypeName.parse('blocks');

  expect(getRelationEnds({ type, source: other }, item)).toStrictEqual({
    source: other,
    target: item,
    other,
  });
});
