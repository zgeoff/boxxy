import type { GateReading, MergeAnswer } from '../ports/types.ts';
import type { AttemptId, CommitSha, Instant, PullRequestRef } from '../types.ts';

// The verify port: what the core reads about the grading at a head. An agent grades in the
// `verify` phase; the tool scopes the features from the paths the pull request changed.
export interface Verifier {
  readAt: (pullRequest: PullRequestRef, head: CommitSha) => Promise<VerifyReading>;
}

// `not-covered`: no gate run at `head` that passed or failed. A passed or failed run with no
// readable report in the pull request reads `incomplete`, with no features.
export type VerifyReading =
  | {
      readonly status: 'verified' | 'incomplete';
      readonly head: CommitSha;
      readonly features: readonly VerifiedFeature[];
    }
  | { readonly status: 'not-covered'; readonly head: CommitSha };

export interface VerifiedFeature {
  readonly name: string;
  readonly status: 'verified' | 'stale' | 'missing' | 'unchanged';
}

// The pull requests that one merge takes, each at the head boxxy read. A direct merge holds one;
// a merge train holds a stack or a batch, with the same outcomes.
export interface MergeUnit {
  readonly members: readonly MergeMember[];
}

export interface MergeMember {
  readonly pullRequest: PullRequestRef;
  readonly head: CommitSha;
}

export type CheckState = 'success' | 'failure' | 'pending' | 'other';

// The latest run of one check name at a head. A `check-run` comes from a GitHub App, such as
// GitHub Actions; a `commit-status` comes from any token that may write statuses.
export interface CheckReading {
  readonly state: CheckState;
  readonly source: 'check-run' | 'commit-status';
}

// `unknown`: the forge has not worked out yet whether the head merges into the base.
export type MergeableState = 'clean' | 'conflict' | 'unknown';

// What the merge job reads on each read. The job decides nothing.
export interface MergeObservation {
  readonly pullRequest: PullRequestRef;
  readonly state: 'open' | 'closed' | 'merged';
  readonly head: CommitSha;

  // GitHub works the mergeable state out late, so `unknown` waits
  readonly mergeable: MergeableState;

  // the latest run of each check name at `head`
  readonly checks: ReadonlyMap<string, CheckState>;

  // the base branch's required status checks; can be empty
  readonly baseRequired: readonly string[];
  readonly mergeCommit: CommitSha | null;

  // the latest settled review of the item, from its close-out
  readonly review: GateRecord | null;

  // the verify reading at `head`
  readonly verify: VerifyReading;
}

export interface GateRecord {
  readonly head: CommitSha;
  readonly status: GateReading['status'];
  readonly attempt: AttemptId;
}

export type MergeOutcome =
  | 'merged'
  | 'repair'
  | 'stale'
  | 'unverified'
  | 'closed'
  | 'stalled'
  | 'refused';

// The last merge request boxxy sent, from the attempt row. `answer` is null when the call got no
// answer.
export interface MergeRequest {
  readonly at: Instant;
  readonly head: CommitSha;
  readonly answer: MergeAnswer | null;
}
