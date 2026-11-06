import { expect, test } from 'bun:test';
import { buildMockLinkRow } from './build-mock-link-row.ts';

test('it builds a default link row', () => {
  const built: unknown = buildMockLinkRow();

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
  const link = buildMockLinkRow({ addedBy: 'boxxy:runner:runner-2' });

  expect(link).toStrictEqual(expect.objectContaining({ addedBy: 'boxxy:runner:runner-2' }));
});
