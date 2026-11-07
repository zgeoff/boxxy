import { expect, test } from 'bun:test';
import { buildMockItemRow } from '@boxxy/model/test-utils/build-mock-item-row';
import { buildMockLinkChange } from './build-mock-link-change.ts';

test('it builds a change that adds a live blocks link', () => {
  const source = buildMockItemRow().id;
  const target = buildMockItemRow().id;
  const change: unknown = buildMockLinkChange({ source, target });

  expect(change).toStrictEqual({
    at: 3500,
    writes: [
      {
        op: 'insert',
        table: 'links',
        row: {
          source,
          target,
          type: 'blocks',
          addedBy: 'boxxy:owner:local',
          addedAt: 3500,
          removedAt: null,
        },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.link.added',
        entity: `boxxy:link:${source}:blocks:${target}`,
        actor: 'boxxy:owner:local',
        payload: { source, target, type: 'blocks' },
      },
    ],
  });
});
