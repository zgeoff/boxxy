import { expect, test } from 'bun:test';
import { brandSchemas } from './brand-schemas.ts';
import { findSlotTake } from './find-slot-take.ts';

test('it finds the one slot take of a change', () => {
  const take = {
    op: 'take-slot',
    pool: brandSchemas.poolName.parse('build'),
    holder: brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
  } as const;

  expect(findSlotTake([take])).toStrictEqual(take);
});

test('it returns null for a change that takes no slot', () => {
  expect(findSlotTake([])).toBeNull();
});

test('it throws on a change that takes two slots', () => {
  const take = {
    op: 'take-slot',
    pool: brandSchemas.poolName.parse('build'),
    holder: brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
  } as const;

  expect(() => findSlotTake([take, take])).toThrow();
});
