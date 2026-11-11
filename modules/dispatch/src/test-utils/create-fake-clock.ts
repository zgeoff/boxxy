import type { Clock, Instant } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

export interface FakeClock extends Clock {
  advance: (byMs: number) => Instant;
}

// A clock that moves only when the test moves it.
export function createFakeClock(startMs = 1_000_000): FakeClock {
  let nowMs = startMs;

  return {
    now: () => brandSchemas.instant.parse(nowMs),
    advance: (byMs) => {
      nowMs += byMs;

      return brandSchemas.instant.parse(nowMs);
    },
  };
}
