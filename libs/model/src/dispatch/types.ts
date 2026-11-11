import type { SpawnRequest } from '../ports/types.ts';
import type { AttemptRow } from '../types.ts';

// The second kind is `wake`: the claim of a sleeping attempt, which the worker resumes.
export type Claim =
  | { readonly kind: 'start'; readonly attempt: AttemptRow; readonly spawn: SpawnRequest }
  | { readonly kind: 'wake'; readonly attempt: AttemptRow };
