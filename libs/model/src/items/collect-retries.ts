import type { RetryLever } from '../pipeline/types.ts';
import type { LeverRow } from '../types.ts';

const retryKind = 'item.retry';

// every `item.retry` lever the item ever had, so the position never depends on the read's time
export function collectRetries(levers: readonly LeverRow[]): RetryLever[] {
  return levers
    .filter((lever) => lever.kind === retryKind)
    .map((lever) => ({ at: lever.at, phase: lever.phase }))
    .toSorted((first, second) => first.at - second.at);
}
