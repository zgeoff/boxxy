import { expect, test } from 'bun:test';
import { buildMockRelationRow } from './build-mock-relation-row.ts';

test('it builds a default relation row', () => {
  const built: unknown = buildMockRelationRow();

  expect(built).toStrictEqual({
    source: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    target: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    type: 'blocks',
    addedBy: 'boxxy:owner:local',
    addedAt: expect.any(Number),
    removedAt: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  const relation = buildMockRelationRow({ addedBy: 'boxxy:runner:runner-2' });

  expect(relation).toStrictEqual(expect.objectContaining({ addedBy: 'boxxy:runner:runner-2' }));
});
