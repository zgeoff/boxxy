import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { pickSeatTake } from './pick-seat-take.ts';

test('it takes one seat in each named limit that has a free seat', () => {
  const workers = brandSchemas.limitName.parse('workers');
  const ownerDesign = brandSchemas.limitName.parse('owner-design');
  const attempt = brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const at = brandSchemas.instant.parse(5000);

  const answer = pickSeatTake(
    { limits: [workers, ownerDesign], attempt, holdGen: 2, overCap: false },
    [
      { name: workers, max: 7, counts: {}, held: 6 },
      { name: ownerDesign, max: 1, counts: {}, held: 0 },
    ],
    at,
  );

  expect(answer).toStrictEqual({
    kind: 'take',
    seats: [
      { limit: workers, attempt, holdGen: 2, overCap: false, takenAt: at, releasedAt: null },
      { limit: ownerDesign, attempt, holdGen: 2, overCap: false, takenAt: at, releasedAt: null },
    ],
  });
});

test('it refuses the whole take when one named limit is full', () => {
  const workers = brandSchemas.limitName.parse('workers');
  const ownerDesign = brandSchemas.limitName.parse('owner-design');
  const attempt = brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');

  const answer = pickSeatTake(
    { limits: [workers, ownerDesign], attempt, holdGen: 1, overCap: false },
    [
      { name: workers, max: 7, counts: {}, held: 0 },
      { name: ownerDesign, max: 1, counts: {}, held: 1 },
    ],
    brandSchemas.instant.parse(5000),
  );

  expect(answer).toStrictEqual({ kind: 'limit-full', limit: ownerDesign });
});

test('it takes past max for a take over the cap', () => {
  const workers = brandSchemas.limitName.parse('workers');
  const attempt = brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const at = brandSchemas.instant.parse(5000);

  const answer = pickSeatTake(
    { limits: [workers], attempt, holdGen: 3, overCap: true },
    [{ name: workers, max: 7, counts: {}, held: 7 }],
    at,
  );

  expect(answer).toStrictEqual({
    kind: 'take',
    seats: [{ limit: workers, attempt, holdGen: 3, overCap: true, takenAt: at, releasedAt: null }],
  });
});

test('it refuses a limit that the store does not hold, even over the cap', () => {
  const workers = brandSchemas.limitName.parse('workers');

  const answer = pickSeatTake(
    {
      limits: [workers],
      attempt: brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
      holdGen: 1,
      overCap: true,
    },
    [{ name: brandSchemas.limitName.parse('owner-design'), max: 1, counts: {}, held: 0 }],
    brandSchemas.instant.parse(5000),
  );

  expect(answer).toStrictEqual({ kind: 'unknown-limit', limit: workers });
});

test('it takes one seat for a limit named twice', () => {
  const workers = brandSchemas.limitName.parse('workers');
  const attempt = brandSchemas.attemptId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77');
  const at = brandSchemas.instant.parse(5000);

  const answer = pickSeatTake(
    { limits: [workers, workers], attempt, holdGen: 1, overCap: false },
    [{ name: workers, max: 7, counts: {}, held: 0 }],
    at,
  );

  expect(answer).toStrictEqual({
    kind: 'take',
    seats: [{ limit: workers, attempt, holdGen: 1, overCap: false, takenAt: at, releasedAt: null }],
  });
});
