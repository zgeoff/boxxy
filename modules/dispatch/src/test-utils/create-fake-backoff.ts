import type { CapacityBackoff, Instant, PoolName } from '@boxxy/model';

// The runner's memory of the pools in backoff. A second hold of a pool keeps the later end.
export function createFakeBackoff(): CapacityBackoff {
  const until = new Map<PoolName, Instant>();

  return {
    hold: (pool, end) => {
      const held = until.get(pool);
      const later = held !== undefined && held > end ? held : end;

      until.set(pool, later);
    },
    listHeld: (now) => [...until].filter(([, end]) => end > now).map(([pool]) => pool),
  };
}
