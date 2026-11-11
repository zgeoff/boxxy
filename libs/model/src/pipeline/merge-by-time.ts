import type { RetryLever, Settled } from './types.ts';

export type TimedEvent =
  | { readonly kind: 'settled'; readonly settled: Settled }
  | { readonly kind: 'retry'; readonly lever: RetryLever };

// Both inputs are oldest first. At equal times a settled attempt comes before a retry lever, so a
// lever filed at the instant an attempt ended acts on the position that attempt gave.
export function mergeByTime(
  attempts: readonly Settled[],
  retries: readonly RetryLever[],
): TimedEvent[] {
  const events: TimedEvent[] = [];
  let attemptIndex = 0;
  let retryIndex = 0;

  while (attemptIndex < attempts.length || retryIndex < retries.length) {
    const settled = attempts[attemptIndex];
    const lever = retries[retryIndex];

    if (settled !== undefined && (lever === undefined || settled.endedAt <= lever.at)) {
      events.push({ kind: 'settled', settled });

      attemptIndex += 1;
    } else if (lever !== undefined) {
      events.push({ kind: 'retry', lever });

      retryIndex += 1;
    }
  }

  return events;
}
