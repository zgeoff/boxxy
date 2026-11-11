import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeClock } from './create-fake-clock.ts';

test('it reads the start time until the test advances it', () => {
  const clock = createFakeClock(5000);

  clock.advance(250);

  expect(clock.now()).toBe(brandSchemas.instant.parse(5250));
});
