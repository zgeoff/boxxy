export interface ShownDerivedState {
  readonly state: string;
  readonly reason?: string | undefined;
}

// The hold of `reason` is `held` while the item is `held` for that reason, and `lifted` once the
// item is no longer `held`. An item still `held` for another reason matches neither, so a lifted
// check fails while any hold remains.
export function pickHoldState(
  derived: ShownDerivedState,
  reason: string,
): 'held' | 'lifted' | 'held for another reason' {
  if (derived.state !== 'held') {
    return 'lifted';
  }

  return derived.reason === reason ? 'held' : 'held for another reason';
}
