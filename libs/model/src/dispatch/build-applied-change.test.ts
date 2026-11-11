import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockV1ItemRow } from '../test-utils/build-mock-v1-item-row.ts';
import { buildMockV1LeverRow } from '../test-utils/build-mock-v1-lever-row.ts';
import { buildAppliedChange } from './build-applied-change.ts';

test('it numbers each lever insert after the last seq, in order, with its fact', () => {
  const first = buildMockV1LeverRow({ seq: 0, kind: 'plan.defer' });
  const second = buildMockV1LeverRow({ seq: 0, kind: 'plan.expedite' });

  const applied = buildAppliedChange(
    {
      at: brandSchemas.instant.parse(5000),
      writes: [
        { op: 'insert', table: 'levers', row: first },
        { op: 'insert', table: 'levers', row: second },
      ],
      facts: [
        {
          id: brandSchemas.factId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
          type: 'boxxy.lever.recorded',
          entity: `boxxy:item:${first.item}`,
          actor: 'boxxy:owner:local',
          payload: first,
        },
        {
          id: brandSchemas.factId.parse('0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30'),
          type: 'boxxy.lever.recorded',
          entity: `boxxy:item:${second.item}`,
          actor: 'boxxy:owner:local',
          payload: second,
        },
      ],
    },
    { lastLeverSeq: 41, lastNoticeId: 0 },
  );

  expect(applied).toStrictEqual({
    writes: [
      { op: 'insert', table: 'levers', row: { ...first, seq: 42 } },
      { op: 'insert', table: 'levers', row: { ...second, seq: 43 } },
    ],
    facts: [
      expect.objectContaining({ payload: { ...first, seq: 42 } }),
      expect.objectContaining({ payload: { ...second, seq: 43 } }),
    ],
  });
});

test('it numbers each notice insert after the last id', () => {
  const item = buildMockV1ItemRow();

  const notice = {
    id: 0,
    item: item.id,
    reason: 'attempts used up',
    at: brandSchemas.instant.parse(5000),
    tries: 0,
    sentAt: null,
  } as const;

  const applied = buildAppliedChange(
    {
      at: brandSchemas.instant.parse(5000),
      writes: [
        { op: 'insert', table: 'notices', row: notice },
        { op: 'insert', table: 'notices', row: notice },
      ],
      facts: [],
    },
    { lastLeverSeq: 0, lastNoticeId: 6 },
  );

  expect(applied.writes).toStrictEqual([
    { op: 'insert', table: 'notices', row: { ...notice, id: 7 } },
    { op: 'insert', table: 'notices', row: { ...notice, id: 8 } },
  ]);
});

test('it leaves every other write as it was', () => {
  const item = buildMockV1ItemRow();

  const applied = buildAppliedChange(
    {
      at: brandSchemas.instant.parse(5000),
      writes: [{ op: 'insert', table: 'items', row: item }],
      facts: [],
    },
    { lastLeverSeq: 3, lastNoticeId: 3 },
  );

  expect(applied.writes).toStrictEqual([{ op: 'insert', table: 'items', row: item }]);
});
