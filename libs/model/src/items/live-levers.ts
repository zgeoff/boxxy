import type { SliceOneLeverRow as LeverRow } from '../slice-one/types.ts';
import type { Instant, LeverKind } from '../types.ts';

// The slice 1 row and the v1 row, which adds `phase`, both pass through with their own type.
export function liveLevers<Lever extends LeverRow>(
  levers: readonly Lever[],
  now: Instant,
): Lever[] {
  return levers.filter((lever) => !isExpired(lever, now) && !isUndone(lever, levers));
}

function isExpired(lever: LeverRow, now: Instant): boolean {
  return lever.expiresAt !== null && lever.expiresAt <= now;
}

const undoKinds: ReadonlyMap<LeverKind, LeverKind> = new Map([
  ['plan.defer', 'plan.undefer'],
  ['plan.expedite', 'plan.unexpedite'],
]);

function isUndone(lever: LeverRow, levers: readonly LeverRow[]): boolean {
  const undoKind = undoKinds.get(lever.kind);

  return levers.some(
    (later) => later.item === lever.item && later.kind === undoKind && later.seq > lever.seq,
  );
}
