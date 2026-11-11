import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeBackoff } from './create-fake-backoff.ts';

test('it lists a held pool until the end of its hold', () => {
  const backoff = createFakeBackoff();
  const pool = brandSchemas.poolName.parse('build');

  backoff.hold(pool, brandSchemas.instant.parse(5000));

  expect([
    backoff.listHeld(brandSchemas.instant.parse(4999)),
    backoff.listHeld(brandSchemas.instant.parse(5000)),
  ]).toStrictEqual([[pool], []]);
});

test('it keeps the later end when a pool is held twice', () => {
  const backoff = createFakeBackoff();
  const pool = brandSchemas.poolName.parse('build');

  backoff.hold(pool, brandSchemas.instant.parse(9000));
  backoff.hold(pool, brandSchemas.instant.parse(5000));

  expect(backoff.listHeld(brandSchemas.instant.parse(6000))).toStrictEqual([pool]);
});
