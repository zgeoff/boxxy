import type { CheckReading, MergeableState } from '../merge/types.ts';
import type { CommitSha, Instant, PullRequestRef, RepoName } from '../types.ts';

export interface Forge {
  readPullRequest: (ref: PullRequestRef) => Promise<PullRequestReading | 'not-found'>;
  listOpenPullRequests: (repo: RepoName) => Promise<PullRequestRef[]>;

  // the description of the pull request, empty when it has none
  readPullRequestBody: (ref: PullRequestRef) => Promise<string>;

  // the latest run of each check name at `head`, from check runs and commit statuses, with its source
  readChecks: (repo: RepoName, head: CommitSha) => Promise<ReadonlyMap<string, CheckReading>>;

  // the forge's compare of two heads: each changed file with its added and deleted lines
  readChangedFiles: (repo: RepoName, from: CommitSha, to: CommitSha) => Promise<ChangedFile[]>;

  // The paths that the pull request changes from its base to its head. A forge that cannot list
  // them throws.
  readChangedPaths: (ref: PullRequestRef) => Promise<ChangedPathsReading>;

  // the checks that the branch requires, by name; empty for a branch that requires none
  readRequiredChecks: (repo: RepoName, branch: string) => Promise<readonly string[]>;
  readMergeable: (ref: PullRequestRef) => Promise<MergeableState>;

  // merges only while the pull request's head is still `head`, and sends one call
  mergeAtHead: (ref: PullRequestRef, head: CommitSha, method: MergeMethod) => Promise<MergeAnswer>;

  // Whether `ref`, a tag, a branch or a commit, holds `commit` in its history, by the forge's
  // compare. A commit that the repo does not hold is not contained.
  contains: (repo: RepoName, ref: string, commit: CommitSha) => Promise<boolean>;

  // `not-found`: the repo is missing, or the App cannot read it
  readRepo: (repo: RepoName) => Promise<'readable' | 'not-found'>;

  // null: no such tag. Call it after `readRepo`, which tells a missing repo from a missing tag.
  readTag: (repo: RepoName, tag: string) => Promise<CommitSha | null>;

  // the published releases, newest first, at most 100
  listReleases: (repo: RepoName) => Promise<readonly Release[]>;

  // The pull requests merged at `since` or later whose author is a Bot, oldest merge first.
  readBumps: (repo: RepoName, since: Instant) => Promise<readonly MergedPullRequest[]>;
}

export interface Release {
  readonly tag: string;

  // https://github.com/<owner>/<name>/releases/tag/<tag>
  readonly url: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly publishedAt: Instant;
}

export interface MergedPullRequest {
  readonly number: number;
  readonly body: string;
  readonly mergeCommit: CommitSha;
  readonly mergedAt: Instant;
}

export interface ChangedFile {
  readonly path: string;
  readonly changedLines: number;
}

export interface ChangedPathsReading {
  // each changed path and each rename's old path, with no path twice
  readonly paths: readonly string[];

  // the pull request's own count of changed files
  readonly changedFiles: number;

  // the forge listed fewer files than the count, so `paths` lacks some
  readonly truncated: boolean;
}

export interface PullRequestReading {
  readonly url: string;

  // GitHub's own `id` of the pull request
  readonly githubId: number;
  readonly state: 'open' | 'closed' | 'merged';

  // the branch that the pull request merges into
  readonly base: string;
  readonly mergedAt: Instant | null;
  readonly mergeCommit: CommitSha | null;
  readonly commits: readonly { readonly sha: CommitSha; readonly message: string }[];
}

export type MergeMethod = 'merge' | 'squash' | 'rebase';

// The forge's answer to a merge at a head. `queued`: a merge queue took the pull request, which a
// direct merge never answers.
export type MergeAnswer =
  | { readonly kind: 'merged'; readonly mergeCommit: CommitSha }
  | { readonly kind: 'queued' }
  | { readonly kind: 'head-moved' }
  | { readonly kind: 'not-mergeable'; readonly reason: string };
