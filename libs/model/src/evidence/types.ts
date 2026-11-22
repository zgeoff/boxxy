import type { CommitSha } from '../types.ts';

// Why the server records no `check` or `verdict`. `no-forge`: the server runs with no `github`
// config. `no-pull-request`: the item has no linked pull request. The rest follow the reading of
// the pull request's head: the check or the feature, and the head the server read.
export type CheckedEvidenceRefusal =
  | { readonly reason: 'no-forge' }
  | { readonly reason: 'no-pull-request' | 'pull-request-closed' }
  | {
      readonly reason: 'check-pending' | 'check-failed' | 'check-missing';
      readonly check: string;
      readonly head: CommitSha;
    }
  | {
      readonly reason: 'verify-pending' | 'verify-failed' | 'verdict-missing';
      readonly feature: string;
      readonly head: CommitSha;

      // the verifier's note on an `incomplete` reading
      readonly note?: string | undefined;
    };
