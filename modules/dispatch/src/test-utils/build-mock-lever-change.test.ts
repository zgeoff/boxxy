import { expect, test } from 'bun:test';
import { buildMockV1LeverRow } from '@boxxy/model/test-utils/build-mock-v1-lever-row';
import { buildMockLeverChange } from './build-mock-lever-change.ts';

test('it builds a change that inserts the lever with its recorded fact', () => {
  const lever = buildMockV1LeverRow({ seq: 0 });
  const change: unknown = buildMockLeverChange(lever);

  expect(change).toStrictEqual({
    at: lever.at,
    writes: [{ op: 'insert', table: 'levers', row: lever }],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.lever.recorded',
        entity: `boxxy:item:${lever.item}`,
        actor: lever.actor,
        payload: lever,
      },
    ],
  });
});
