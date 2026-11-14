export interface ShownDerivedState {
  readonly state: string;
  readonly reason?: string | undefined;
}

export interface ShownPosition {
  readonly kind: string;
  readonly reason?: string | undefined;
}

export interface ShownHoldItem {
  readonly derived: ShownDerivedState;
  readonly position: ShownPosition;
}

// A rules hold derives as `waiting`, like an open pull request does, so the position tells them
// apart. An item held for another reason matches neither answer, so a lifted check fails while any
// hold remains.
export function pickHoldState(
  shown: ShownHoldItem,
  reason: string,
): 'held' | 'lifted' | 'held for another reason' {
  const heldReason = findHeldReason(shown);

  if (heldReason === null) {
    return 'lifted';
  }

  return heldReason === reason ? 'held' : 'held for another reason';
}

function findHeldReason(shown: ShownHoldItem): string | null {
  if (shown.derived.state === 'held') {
    return shown.derived.reason ?? null;
  }

  return shown.position.kind === 'hold' ? (shown.position.reason ?? null) : null;
}
