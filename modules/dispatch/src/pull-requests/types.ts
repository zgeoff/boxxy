import type {
  AttemptRow,
  ClaimStore,
  Forge,
  Instant,
  ItemRules,
  NewId,
  RepoName,
  RunnerId,
} from '@boxxy/model';

export interface LinkPullRequestInput {
  readonly store: ClaimStore;
  readonly forge: Forge;
  readonly rules: ItemRules;

  // the attempt of the session that made the call, as `pickCallAttempt` gave it
  readonly attempt: AttemptRow;

  // the URL the hook read from the output of `gh pr create`
  readonly url: string;
  readonly now: Instant;
  readonly newId: NewId;
}

export type LinkPullRequestResult =
  | {
      readonly kind: 'linked';
      readonly repo: RepoName;
      readonly number: number;

      // the pull request was already linked to this item and nothing was written
      readonly repeat: boolean;
    }

  // the forge did not answer, or does not know the pull request yet; nothing was written
  | { readonly kind: 'retry' }

  // `not-a-pull-request-url`: no pull request URL, or one of a repo other than the item's
  | {
      readonly kind: 'refused';
      readonly reason: 'not-a-pull-request-url' | 'linked-elsewhere';
    };

export interface WatchPullRequestsInput {
  readonly store: ClaimStore;
  readonly forge: Forge;
  readonly rules: ItemRules;
  readonly runner: RunnerId;
  readonly now: Instant;
  readonly newId: NewId;
}

// What one pass of the watch did. `unanswered` counts forge calls that threw; each is tried
// again on the next pass.
export interface WatchReport {
  readonly linked: number;
  readonly commitsLinked: number;
  readonly merged: number;
  readonly closed: number;
  readonly unanswered: number;
}
