import type { GateReading, MergeAnswer, VerifyReading } from '../ports/types.ts';
import type { AttemptId, CommitSha, Instant, PullRequestRef } from '../types.ts';

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

// What the merge job reads on each read. The job decides nothing.
export interface MergeObservation {
  readonly pullRequest: PullRequestRef;
  readonly state: 'open' | 'closed' | 'merged';
  readonly head: CommitSha;

  // GitHub works the mergeable state out late, so `unknown` waits
  readonly mergeable: 'clean' | 'conflict' | 'unknown';

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
