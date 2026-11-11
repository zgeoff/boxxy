import type { SpawnRequest } from '../ports/types.ts';
import type { AttemptRow, KeptSession } from '../types.ts';

// The second kind is `wake`: the claim of a sleeping attempt, which the worker resumes.
export type Claim =
  | {
      readonly kind: 'start';
      readonly attempt: AttemptRow;
      readonly spawn: SpawnRequest;

      // the item's kept session, when the claim came back through an edge with `resume: true`
      readonly kept: KeptSession | null;
    }
  | { readonly kind: 'wake'; readonly attempt: AttemptRow };
