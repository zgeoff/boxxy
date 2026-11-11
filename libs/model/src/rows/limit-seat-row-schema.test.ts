import { expect, test } from 'bun:test';
import { limitSeatRowSchema } from './limit-seat-row-schema.ts';

test('it accepts a seat taken over the cap', () => {
  const row = {
    limit: 'workers',
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    holdGen: 2,
    overCap: true,
    takenAt: 1000,
    releasedAt: null,
  };

  const parsed: unknown = limitSeatRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a seat with a hold generation of zero', () => {
  expect(limitSeatRowSchema.safeParse({ holdGen: 0 }).error?.issues).toPartiallyContain({
    path: ['holdGen'],
  });
});
