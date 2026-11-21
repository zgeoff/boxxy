import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createFakeInstantClock } from './create-fake-instant-clock.ts';

test('it reads the start time until the test advances it', () => {
  const clock = createFakeInstantClock(5000);

  clock.advance(250);

  expect(clock.now()).toBe(brandSchemas.instant.parse(5250));
});
