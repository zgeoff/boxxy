import { expect, test } from 'bun:test';
import { brandSchemas } from './brand-schemas.ts';
import { buildAppliedChange } from './build-applied-change.ts';
import { buildMockAttemptRow } from './test-utils/build-mock-attempt-row.ts';
import { buildMockLeverRow } from './test-utils/build-mock-lever-row.ts';

test('it writes the taken slot into the attempt row and its claimed fact', () => {
  const attempt = buildMockAttemptRow({ slot: 0, slotGen: 0 });

  const applied = buildAppliedChange(
    {
      at: brandSchemas.instant.parse(5000),
      writes: [
        { op: 'take-slot', pool: attempt.pool, holder: attempt.id },
        { op: 'insert', table: 'attempts', row: attempt },
      ],
      facts: [
        {
          id: brandSchemas.factId.parse('manual:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
          type: 'boxxy.attempt.claimed',
          entity: `boxxy:attempt:${attempt.id}`,
          actor: 'boxxy:runner:runner-1',
          payload: {
            item: attempt.item,
            phase: attempt.phase,
            number: 1,
            pool: attempt.pool,
            slot: 0,
            gen: 0,
            recipeHash: attempt.recipeHash,
            rulesVersion: attempt.rulesVersion,
          },
        },
      ],
    },
    { taken: { holder: attempt.id, pool: attempt.pool, slot: 2, gen: 7 }, lastLeverSeq: 0 },
  );

  expect(applied).toStrictEqual({
    writes: [
      { op: 'take-slot', pool: attempt.pool, holder: attempt.id },
      { op: 'insert', table: 'attempts', row: { ...attempt, slot: 2, slotGen: 7 } },
    ],
    facts: [
      expect.objectContaining({
        type: 'boxxy.attempt.claimed',
        payload: expect.objectContaining({ slot: 2, gen: 7 }),
      }),
    ],
  });
});

test('it leaves the attempt row of another holder as it was', () => {
  const attempt = buildMockAttemptRow({ slot: 0, slotGen: 0 });
  const other = buildMockAttemptRow();

  const applied = buildAppliedChange(
    {
      at: brandSchemas.instant.parse(5000),
      writes: [{ op: 'insert', table: 'attempts', row: attempt }],
      facts: [],
    },
    { taken: { holder: other.id, pool: other.pool, slot: 2, gen: 7 }, lastLeverSeq: 0 },
  );

  expect(applied.writes).toStrictEqual([{ op: 'insert', table: 'attempts', row: attempt }]);
});

test('it numbers each lever insert after the last seq, in order, with its fact', () => {
  const first = buildMockLeverRow({ seq: 0, kind: 'plan.defer' });
  const second = buildMockLeverRow({ seq: 0, kind: 'plan.expedite' });

  const applied = buildAppliedChange(
    {
      at: brandSchemas.instant.parse(5000),
      writes: [
        { op: 'insert', table: 'levers', row: first },
        { op: 'insert', table: 'levers', row: second },
      ],
      facts: [
        {
          id: brandSchemas.factId.parse('manual:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
          type: 'boxxy.lever.recorded',
          entity: `boxxy:item:${first.item}`,
          actor: 'boxxy:owner:local',
          payload: first,
        },
        {
          id: brandSchemas.factId.parse('manual:0192f0c4-7b1f-7c22-8e01-6a4b2d9f1c30'),
          type: 'boxxy.lever.recorded',
          entity: `boxxy:item:${second.item}`,
          actor: 'boxxy:owner:local',
          payload: second,
        },
      ],
    },
    { taken: null, lastLeverSeq: 41 },
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
