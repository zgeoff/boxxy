import type { LeverRow } from '../types.ts';
import { heldLeverKind, releaseLeverKind } from './constants.ts';

// The reason of the item's hold, or null when the item is not held. It reads every lever the item
// ever had, never the read's time, so no clock can release a hold.
export function findHeldReason(levers: readonly LeverRow[]): string | null {
  const latest = levers
    .filter((lever) => lever.kind === heldLeverKind || lever.kind === releaseLeverKind)
    .reduce<LeverRow | null>(
      (last, lever) => (last === null || lever.seq > last.seq ? lever : last),
      null,
    );

  return latest?.kind === heldLeverKind ? (latest.reason ?? 'held') : null;
}
