import type { Instant, LeverKind, LeverRow } from '../types.ts';

export function liveLevers(levers: readonly LeverRow[], now: Instant): LeverRow[] {
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
