import type { CapacityBackoff, Instant, PoolName } from '@boxxy/model';

// The runner's memory of the pools that a host refused for capacity. It lives in the process: a
// restart forgets it, and the next refusal holds the pool again. A second hold keeps the later
// end.
export function createCapacityBackoff(): CapacityBackoff {
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
