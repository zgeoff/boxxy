import type { Instant, MergeObservation, MergeRequest, MergeRules } from '@boxxy/model';

export interface DecideMergeInput {
  readonly observed: MergeObservation;
  readonly rules: MergeRules;

  // the merge step's time limit, from the attempt's claim, has passed
  readonly deadlinePassed: boolean;

  // the last merge request boxxy sent for the attempt, null before the first
  readonly acted: MergeRequest | null;
  readonly now: Instant;

  // a request with no answer is sent again only this long after it was marked
  readonly actRetryMinutes: number;
}
