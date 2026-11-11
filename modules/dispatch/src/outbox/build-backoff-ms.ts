import type { OutboxLimits } from './types.ts';

// The wait before the next try, after this many `retry` answers in a row: the first wait, doubled
// each time up to the longest wait, then moved by the jitter. `random` is in [0, 1).
export function buildBackoffMs(retries: number, limits: OutboxLimits, random: number): number {
  const backoff = limits.backoff;

  const base = Math.min(
    backoff.firstMs * backoff.factor ** Math.max(retries - 1, 0),
    backoff.maxMs,
  );

  return Math.round(base * (1 + backoff.jitter * (2 * random - 1)));
}
