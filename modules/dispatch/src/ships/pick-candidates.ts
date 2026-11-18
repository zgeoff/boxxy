import type { Instant, ItemId } from '@boxxy/model';
import { shipWatchLimits } from './constants.ts';
import type { ShipCandidate } from './types.ts';

// The candidates a pass reads: those read least recently first, never-read ones before any read
// one, so no item waits behind items that never ship. It forgets items that are no longer
// candidates, and records the pass's reads.
export function pickCandidates(
  found: readonly ShipCandidate[],
  lastChecked: Map<ItemId, Instant>,
  now: Instant,
): ShipCandidate[] {
  const ids = new Set(found.map((candidate) => candidate.itemId));

  for (const id of lastChecked.keys()) {
    if (!ids.has(id)) {
      lastChecked.delete(id);
    }
  }

  const checkedAt = (candidate: ShipCandidate): number =>
    lastChecked.get(candidate.itemId) ?? Number.NEGATIVE_INFINITY;

  const picked = found
    .toSorted((left, right) => checkedAt(left) - checkedAt(right))
    .slice(0, shipWatchLimits.itemsPerPass);

  for (const candidate of picked) {
    lastChecked.set(candidate.itemId, now);
  }

  return picked;
}
