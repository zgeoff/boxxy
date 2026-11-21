import type { Clock, Instant } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { createFakeClock } from '@zgeoff/testing/clock';

export interface FakeInstantClock extends Clock {
  advance: (byMs: number) => Instant;
}

// A clock that reads the model's `Instant` and moves only when the test moves it. The kit's fake
// clock keeps the time.
export function createFakeInstantClock(startMs = 1_000_000): FakeInstantClock {
  const clock = createFakeClock({ startMs });
  const readInstant = (): Instant => brandSchemas.instant.parse(clock.now());

  return {
    now: readInstant,
    advance: (byMs) => {
      clock.advance(byMs);

      return readInstant();
    },
  };
}
