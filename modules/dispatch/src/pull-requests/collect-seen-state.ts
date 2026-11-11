import type { CommitSha, Instant, PullRequestReading, PullRequestRow } from '@boxxy/model';

export interface SeenState {
  readonly state: PullRequestRow['state'];
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
}

// The state the watch records for a reading. A merged reading with no merge time or no merge
// commit reads as open, so the next pass sees the merge once the forge shows it whole.
export function collectSeenState(reading: PullRequestReading): SeenState {
  if (reading.state === 'merged') {
    return reading.mergedAt !== null && reading.mergeCommit !== null
      ? { state: 'merged', mergedAt: reading.mergedAt, mergeCommit: reading.mergeCommit }
      : { state: 'open', mergedAt: null, mergeCommit: null };
  }

  return { state: reading.state, mergedAt: null, mergeCommit: null };
}
