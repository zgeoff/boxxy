import { expect, test } from 'bun:test';
import { buildMockLeverRow } from '@boxxy/model/test-utils/build-mock-lever-row';
import { buildMockLeverChange } from './build-mock-lever-change.ts';

test('it builds a change that inserts the lever with its recorded fact', () => {
  const lever = buildMockLeverRow({ seq: 0 });
  const change: unknown = buildMockLeverChange(lever);

  expect(change).toStrictEqual({
    at: lever.at,
    writes: [{ op: 'insert', table: 'levers', row: lever }],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.lever.recorded',
        entity: `boxxy:item:${lever.item}`,
        actor: lever.actor,
        payload: lever,
      },
    ],
  });
});
