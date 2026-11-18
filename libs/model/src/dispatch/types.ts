import type { SpawnRequest } from '../ports/types.ts';
import type { AttemptRow, ItemId, KeptSession, PhaseName, SkipReason } from '../types.ts';

// The second kind is `wake`: the claim of a sleeping attempt, which the worker resumes. The third
// is `skipped`: a step that the claim settled with no session, because a gate of the step said
// skip.
export type Claim =
  | {
      readonly kind: 'start';
      readonly attempt: AttemptRow;
      readonly spawn: SpawnRequest;
      readonly kept: KeptPick;
    }
  | { readonly kind: 'wake'; readonly attempt: AttemptRow }
  | SkippedClaim;

// A claim that starts or wakes a session
export type PickedClaim = Exclude<Claim, { readonly kind: 'skipped' }>;

export interface SkippedClaim {
  readonly kind: 'skipped';
  readonly itemId: ItemId;
  readonly phase: PhaseName;
  readonly reason: SkipReason;
}

// What one `claimNext` did: every skip it recorded, then the claim it picked, if any.
export interface ClaimNextResult {
  readonly skips: readonly SkippedClaim[];
  readonly pick: PickedClaim | null;
}

// Whether a start claim wakes the item's kept session. A claim wants one when it came back
// through an edge with `resume: true`, or when its recipe has `session: builder`. `gone`: the
// claim wants one and the item keeps none, so its fresh session is a fallback.
export type KeptPick =
  | { readonly kind: 'none' }
  | { readonly kind: 'kept'; readonly session: KeptSession }
  | { readonly kind: 'gone' };
