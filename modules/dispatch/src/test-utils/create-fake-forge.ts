import type {
  ChangedFile,
  CheckReading,
  CheckState,
  CommitSha,
  Forge,
  MergeableState,
  PullRequestReading,
  PullRequestRef,
  RepoName,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

// A pull request as a test puts it on a forge. The url is the one GitHub gives.
export interface SeededPullRequest {
  readonly ref: PullRequestRef;
  readonly githubId: number;
  readonly reading: Omit<PullRequestReading, 'githubId' | 'url'>;

  // the description; none reads as empty
  readonly body?: string;
}

// The latest check run and commit status of each name at a head, as a test puts them on a forge.
// A check run wins over a commit status of the same name.
export interface SeededChecks {
  readonly repo: RepoName;
  readonly head: CommitSha;
  readonly checks: Readonly<Record<string, CheckState>>;
  readonly statuses?: Readonly<Record<string, CheckState>>;
}

// A compare of two heads as a test puts it on a forge.
export interface SeededCompare {
  readonly repo: RepoName;
  readonly from: CommitSha;
  readonly to: CommitSha;
  readonly files: readonly ChangedFile[];
}

// The checks that a branch requires, as a test puts them on a forge. A branch with none seeded
// does not exist.
export interface SeededRequiredChecks {
  readonly repo: RepoName;
  readonly branch: string;
  readonly checks: readonly string[];
}

// Whether a pull request merges into its base; a pull request with none seeded is `clean`.
export interface SeededMergeable {
  readonly ref: PullRequestRef;
  readonly mergeable: MergeableState;
}

export interface ReadHold {
  readonly entered: Promise<void>;
  readonly release: () => void;
}

export interface FakeForge extends Forge {
  // every call, in order
  readonly calls: readonly string[];
  seed: (pullRequest: SeededPullRequest) => void;

  // the files that the compare of `from` and `to` in the repo gives
  seedCompare: (compare: SeededCompare) => void;

  // the checks at a head; a head with none seeded has no runs
  seedChecks: (checks: SeededChecks) => void;
  seedRequiredChecks: (required: SeededRequiredChecks) => void;
  seedMergeable: (mergeable: SeededMergeable) => void;

  // while down, every call rejects, as a forge that does not answer
  setDown: (isDown: boolean) => void;

  // the next `readPullRequest` waits until the test calls `release`; `entered` resolves once that
  // read has started, so a test can change the store while the read is in flight
  holdNextRead: () => ReadHold;
}

// a fixed time, because a module reads no clock
const mergedAtMs = brandSchemas.instant.parse(1_900_000_000_000);

// A forge that keeps the pull requests a test seeds and answers as the `Forge` contract says.
export function createFakeForge(): FakeForge {
  const pullRequests = new Map<string, SeededPullRequest>();
  const compares = new Map<string, readonly ChangedFile[]>();
  const checksByHead = new Map<string, ReadonlyMap<string, CheckReading>>();
  const requiredByBranch = new Map<string, readonly string[]>();
  const mergeableByPullRequest = new Map<string, MergeableState>();

  const calls: string[] = [];
  let isDown = false;
  let mergeCount = 0;
  let hold: { readonly entered: () => void; readonly released: Promise<void> } | null = null;

  const answerRead = (ref: PullRequestRef): Promise<PullRequestReading | 'not-found'> => {
    if (isDown) {
      return Promise.reject(new Error('the fake forge is down'));
    }

    const found = pullRequests.get(toKey(ref));

    if (found === undefined) {
      return Promise.resolve('not-found');
    }

    return Promise.resolve({
      ...found.reading,
      githubId: found.githubId,
      url: `https://github.com/${found.ref.repo}/pull/${found.ref.number}`,
    });
  };

  return {
    calls,
    seed: (pullRequest) => {
      pullRequests.set(toKey(pullRequest.ref), pullRequest);
    },
    seedCompare: (compare) => {
      compares.set(toCompareKey(compare.repo, compare.from, compare.to), compare.files);
    },
    seedChecks: (seeded) => {
      const statuses = Object.entries(seeded.statuses ?? {}).map(
        ([name, state]) => [name, { state, source: 'commit-status' }] as const,
      );

      const runs = Object.entries(seeded.checks).map(
        ([name, state]) => [name, { state, source: 'check-run' }] as const,
      );

      checksByHead.set(
        toHeadKey(seeded.repo, seeded.head),
        new Map<string, CheckReading>([...statuses, ...runs]),
      );
    },
    seedRequiredChecks: (required) => {
      requiredByBranch.set(toBranchKey(required.repo, required.branch), required.checks);
    },
    seedMergeable: (seeded) => {
      mergeableByPullRequest.set(toKey(seeded.ref), seeded.mergeable);
    },
    setDown: (down) => {
      isDown = down;
    },
    holdNextRead: () => {
      const entered = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();

      hold = {
        entered: () => {
          entered.resolve(undefined);
        },
        released: released.promise,
      };

      return {
        entered: entered.promise,
        release: () => {
          released.resolve(undefined);
        },
      };
    },
    readPullRequest: async (ref) => {
      calls.push(`readPullRequest ${toKey(ref)}`);

      const held = hold;

      hold = null;

      if (held !== null) {
        held.entered();

        await held.released;
      }

      return answerRead(ref);
    },
    listOpenPullRequests: (repo: RepoName) => {
      calls.push(`listOpenPullRequests ${repo}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const open = [...pullRequests.values()].filter(
        (pullRequest) => pullRequest.ref.repo === repo && pullRequest.reading.state === 'open',
      );

      return Promise.resolve(
        open
          .map((pullRequest) => pullRequest.ref)
          .toSorted((first, second) => first.number - second.number),
      );
    },
    readChangedFiles: (repo, from, to) => {
      calls.push(`readChangedFiles ${repo} ${from}...${to}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const files = compares.get(toCompareKey(repo, from, to));

      // GitHub answers 404 to a compare of a head it does not hold
      return files === undefined
        ? Promise.reject(new Error(`the fake forge holds no compare of ${from}...${to}`))
        : Promise.resolve([...files]);
    },
    readPullRequestBody: (ref) => {
      calls.push(`readPullRequestBody ${toKey(ref)}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const found = pullRequests.get(toKey(ref));

      // GitHub answers 404 to a pull request it does not hold
      return found === undefined
        ? Promise.reject(new Error(`the fake forge holds no pull request ${toKey(ref)}`))
        : Promise.resolve(found.body ?? '');
    },
    readChecks: (repo, head) => {
      calls.push(`readChecks ${repo} ${head}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const checks = new Map(checksByHead.get(toHeadKey(repo, head)));

      return Promise.resolve(checks);
    },
    readRequiredChecks: (repo, branch) => {
      calls.push(`readRequiredChecks ${repo} ${branch}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const required = requiredByBranch.get(toBranchKey(repo, branch));

      // GitHub answers 404 to a branch it does not hold
      return required === undefined
        ? Promise.reject(new Error(`the fake forge holds no branch ${branch}`))
        : Promise.resolve([...required]);
    },
    readMergeable: (ref) => {
      calls.push(`readMergeable ${toKey(ref)}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      return pullRequests.has(toKey(ref))
        ? Promise.resolve(mergeableByPullRequest.get(toKey(ref)) ?? 'clean')
        : Promise.reject(new Error(`the fake forge holds no pull request ${toKey(ref)}`));
    },
    mergeAtHead: (ref, head, method) => {
      calls.push(`mergeAtHead ${toKey(ref)} ${head} ${method}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const found = pullRequests.get(toKey(ref));

      if (found === undefined) {
        return Promise.reject(new Error(`the fake forge holds no pull request ${toKey(ref)}`));
      }

      if (found.reading.commits.at(-1)?.sha !== head) {
        return Promise.resolve({ kind: 'head-moved' });
      }

      const mergeable = mergeableByPullRequest.get(toKey(ref)) ?? 'clean';

      if (found.reading.state !== 'open' || mergeable !== 'clean') {
        return Promise.resolve({ kind: 'not-mergeable', reason: 'Pull Request is not mergeable' });
      }

      mergeCount += 1;

      const mergeCommit = brandSchemas.commitSha.parse(mergeCount.toString(16).padStart(40, 'e'));

      pullRequests.set(toKey(ref), {
        ...found,
        reading: { ...found.reading, state: 'merged', mergedAt: mergedAtMs, mergeCommit },
      });

      return Promise.resolve({ kind: 'merged', mergeCommit });
    },
  };
}

// GitHub matches a repo name in any case
function toKey(ref: PullRequestRef): string {
  return `${ref.repo.toLowerCase()}#${ref.number}`;
}

function toCompareKey(repo: RepoName, from: CommitSha, to: CommitSha): string {
  return `${repo.toLowerCase()} ${from}...${to}`;
}

function toHeadKey(repo: RepoName, head: CommitSha): string {
  return `${repo.toLowerCase()} ${head}`;
}

// a branch name is case-sensitive on GitHub
function toBranchKey(repo: RepoName, branch: string): string {
  return `${repo.toLowerCase()} ${branch}`;
}
