import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createCapacityBackoff } from './create-capacity-backoff.ts';

test('it lists a held pool until the end of its hold', () => {
  const backoff = createCapacityBackoff();
  const pool = brandSchemas.poolName.parse('build');

  backoff.hold(pool, brandSchemas.instant.parse(5000));

  expect([
    backoff.listHeld(brandSchemas.instant.parse(4999)),
    backoff.listHeld(brandSchemas.instant.parse(5000)),
  ]).toStrictEqual([[pool], []]);
});

test('it keeps the later end when a pool is held twice', () => {
  const backoff = createCapacityBackoff();
  const pool = brandSchemas.poolName.parse('build');

  backoff.hold(pool, brandSchemas.instant.parse(9000));
  backoff.hold(pool, brandSchemas.instant.parse(5000));

  expect(backoff.listHeld(brandSchemas.instant.parse(6000))).toStrictEqual([pool]);
});

test('it lists only the pools whose hold has not ended', () => {
  const backoff = createCapacityBackoff();
  const build = brandSchemas.poolName.parse('build');
  const review = brandSchemas.poolName.parse('review');

  backoff.hold(build, brandSchemas.instant.parse(3000));
  backoff.hold(review, brandSchemas.instant.parse(8000));

  expect(backoff.listHeld(brandSchemas.instant.parse(4000))).toStrictEqual([review]);
});
