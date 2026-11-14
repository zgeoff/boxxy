export interface ShownDerivedState {
  readonly state: string;
  readonly reason?: string | undefined;
}

// The hold of `reason` is `held` only while the item is `held` for that reason. An item `held` for
// another reason, or in any other state, has no such hold.
export function pickHoldState(derived: ShownDerivedState, reason: string): 'held' | 'lifted' {
  return derived.state === 'held' && derived.reason === reason ? 'held' : 'lifted';
}
