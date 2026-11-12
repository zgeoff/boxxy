import type { SpawnRequest } from '../ports/types.ts';
import type { AttemptRow, KeptSession } from '../types.ts';

// The second kind is `wake`: the claim of a sleeping attempt, which the worker resumes.
export type Claim =
  | {
      readonly kind: 'start';
      readonly attempt: AttemptRow;
      readonly spawn: SpawnRequest;
      readonly kept: KeptPick;
    }
  | { readonly kind: 'wake'; readonly attempt: AttemptRow };

// Whether a start claim wakes the item's kept session. A claim wants one when it came back
// through an edge with `resume: true`, or when its recipe has `session: builder`. `gone`: the
// claim wants one and the item keeps none, so its fresh session is a fallback.
export type KeptPick =
  | { readonly kind: 'none' }
  | { readonly kind: 'kept'; readonly session: KeptSession }
  | { readonly kind: 'gone' };
