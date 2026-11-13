import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockRelationRow } from '../test-utils/build-mock-relation-row.ts';
import { hasRelationPath } from './has-relation-path.ts';

test('it finds a path through a chain of relations', () => {
  const first = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const second = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');
  const third = brandSchemas.itemId.parse('0192f0c6-1a2b-7c3d-8e4f-5a6b7c8d9e0f');

  const relations = [
    buildMockRelationRow({ source: first, target: second }),
    buildMockRelationRow({ source: second, target: third }),
  ];

  expect(hasRelationPath(relations, first, third)).toBe(true);
});

test('it finds no path against the direction of the relations', () => {
  const first = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const second = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');
  const third = brandSchemas.itemId.parse('0192f0c6-1a2b-7c3d-8e4f-5a6b7c8d9e0f');

  const relations = [
    buildMockRelationRow({ source: first, target: second }),
    buildMockRelationRow({ source: second, target: third }),
  ];

  expect(hasRelationPath(relations, third, first)).toBe(false);
});

test('it stops on a loop that does not reach the item', () => {
  const first = brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const second = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');
  const third = brandSchemas.itemId.parse('0192f0c6-1a2b-7c3d-8e4f-5a6b7c8d9e0f');

  const relations = [
    buildMockRelationRow({ source: first, target: second }),
    buildMockRelationRow({ source: second, target: first }),
  ];

  expect(hasRelationPath(relations, first, third)).toBe(false);
});
