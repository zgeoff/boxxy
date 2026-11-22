import type {
  ChangedFile,
  CheckReading,
  CheckState,
  CommitSha,
  Forge,
  MergeableState,
  MergedPullRequest,
  PullRequestReading,
  PullRequestRef,
  Release,
  RepoName,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

// A pull request as a test puts it on a forge. The url is the one GitHub gives, and a pull
// request with no base seeded merges into `main`.
export interface SeededPullRequest {
  readonly ref: PullRequestRef;
  readonly githubId: number;
  readonly reading: Omit<PullRequestReading, 'githubId' | 'url' | 'base' | 'head'> & {
    readonly base?: string;

    // a pull request with none seeded has the SHA of its last commit, or a fixed one with none
    readonly head?: CommitSha;
  };

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

// The files of a pull request as a test puts them on a forge. A rename lists its old path as
// `previousPath`. `changedFiles` is the pull request's own count, which is the number of `files`
// when left out; a larger count reads as a list the forge cut short.
export interface SeededChangedFiles {
  readonly ref: PullRequestRef;
  readonly files: readonly { readonly path: string; readonly previousPath?: string }[];
  readonly changedFiles?: number;
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

// A repo that a test puts on a forge: `readRepo` answers `readable` for it, and `not-found` for
// any other.
export interface SeededRepo {
  readonly repo: RepoName;
}

export interface SeededTag {
  readonly repo: RepoName;
  readonly tag: string;
  readonly commit: CommitSha;
}

// The commits that the history of `ref`, a tag, a branch or a commit, holds.
export interface SeededHistory {
  readonly repo: RepoName;
  readonly ref: string;
  readonly commits: readonly CommitSha[];
}

// A draft has no publish time, so a forge lists none of them
export type SeededDraft = Omit<Release, 'publishedAt'> & { readonly publishedAt: null };

// The releases of a repo, in any order, drafts included.
export interface SeededReleases {
  readonly repo: RepoName;
  readonly releases: readonly (Release | SeededDraft)[];
}

// The merged pull requests of a repo, with the type of each one's author.
export interface SeededBumps {
  readonly repo: RepoName;
  readonly bumps: readonly (MergedPullRequest & { readonly author: 'Bot' | 'User' })[];
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

  // the files of a pull request; one with none seeded changes no file
  seedChangedFiles: (changed: SeededChangedFiles) => void;

  // the checks at a head; a head with none seeded has no runs
  seedChecks: (checks: SeededChecks) => void;
  seedRequiredChecks: (required: SeededRequiredChecks) => void;
  seedMergeable: (mergeable: SeededMergeable) => void;
  seedRepo: (repo: SeededRepo) => void;
  seedTag: (tag: SeededTag) => void;
  seedHistory: (history: SeededHistory) => void;
  seedReleases: (releases: SeededReleases) => void;
  seedBumps: (bumps: SeededBumps) => void;

  // while down, every call rejects, as a forge that does not answer
  setDown: (isDown: boolean) => void;

  // the next `readPullRequest` waits until the test calls `release`; `entered` resolves once that
  // read has started, so a test can change the store while the read is in flight
  holdNextRead: () => ReadHold;
}

// a fixed time, because a module reads no clock
const mergedAtMs = brandSchemas.instant.parse(1_900_000_000_000);
const defaultBase = 'main';
const defaultHead = brandSchemas.commitSha.parse('c'.repeat(40));

// A forge that keeps the pull requests a test seeds and answers as the `Forge` contract says.
export function createFakeForge(): FakeForge {
  const pullRequests = new Map<string, SeededPullRequest>();
  const compares = new Map<string, readonly ChangedFile[]>();
  const changedFilesByPullRequest = new Map<string, SeededChangedFiles>();
  const checksByHead = new Map<string, ReadonlyMap<string, CheckReading>>();
  const requiredByBranch = new Map<string, readonly string[]>();
  const mergeableByPullRequest = new Map<string, MergeableState>();
  const repos = new Set<string>();
  const tags = new Map<string, CommitSha>();
  const histories = new Map<string, ReadonlySet<CommitSha>>();
  const releasesByRepo = new Map<string, readonly (Release | SeededDraft)[]>();
  const bumpsByRepo = new Map<string, SeededBumps['bumps']>();

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
      base: found.reading.base ?? defaultBase,
      head: found.reading.head ?? found.reading.commits.at(-1)?.sha ?? defaultHead,
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
    seedChangedFiles: (seeded) => {
      changedFilesByPullRequest.set(toKey(seeded.ref), seeded);
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
    seedRepo: (seeded) => {
      repos.add(seeded.repo.toLowerCase());
    },
    seedTag: (seeded) => {
      tags.set(toTagKey(seeded.repo, seeded.tag), seeded.commit);
    },
    seedHistory: (seeded) => {
      histories.set(toTagKey(seeded.repo, seeded.ref), new Set(seeded.commits));
    },
    seedReleases: (seeded) => {
      releasesByRepo.set(seeded.repo.toLowerCase(), seeded.releases);
    },
    seedBumps: (seeded) => {
      bumpsByRepo.set(seeded.repo.toLowerCase(), seeded.bumps);
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
    readChangedPaths: (ref) => {
      calls.push(`readChangedPaths ${toKey(ref)}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      if (!pullRequests.has(toKey(ref))) {
        return Promise.reject(new Error(`the fake forge holds no pull request ${toKey(ref)}`));
      }

      const seeded = changedFilesByPullRequest.get(toKey(ref));
      const files = seeded?.files ?? [];
      const changedFiles = seeded?.changedFiles ?? files.length;

      const paths = files.flatMap((file) =>
        file.previousPath === undefined ? [file.path] : [file.path, file.previousPath],
      );

      return Promise.resolve({
        paths: [...new Set(paths)],
        changedFiles,
        truncated: files.length < changedFiles,
      });
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

      const found = pullRequests.get(toKey(ref));

      if (found === undefined) {
        return Promise.reject(new Error(`the fake forge holds no pull request ${toKey(ref)}`));
      }

      // GitHub answers `mergeable: null` for a pull request that is no longer open
      const mergeable: MergeableState =
        found.reading.state === 'open'
          ? (mergeableByPullRequest.get(toKey(ref)) ?? 'clean')
          : 'unknown';

      return Promise.resolve(mergeable);
    },
    contains: (repo, ref, commit) => {
      calls.push(`contains ${repo} ${ref} ${commit}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const history = histories.get(toTagKey(repo, ref));

      return Promise.resolve(history?.has(commit) === true || ref === commit);
    },
    readRepo: (repo) => {
      calls.push(`readRepo ${repo}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const answer = repos.has(repo.toLowerCase()) ? 'readable' : 'not-found';

      return Promise.resolve(answer);
    },
    readTag: (repo, tag) => {
      calls.push(`readTag ${repo} ${tag}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      return Promise.resolve(tags.get(toTagKey(repo, tag)) ?? null);
    },
    listReleases: (repo) => {
      calls.push(`listReleases ${repo}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const published = (releasesByRepo.get(repo.toLowerCase()) ?? []).flatMap((release) =>
        release.publishedAt === null ? [] : [{ ...release, publishedAt: release.publishedAt }],
      );

      return Promise.resolve(
        published.toSorted((first, second) => second.publishedAt - first.publishedAt).slice(0, 100),
      );
    },
    readBumps: (repo, since) => {
      calls.push(`readBumps ${repo} ${since}`);

      if (isDown) {
        return Promise.reject(new Error('the fake forge is down'));
      }

      const bumps = (bumpsByRepo.get(repo.toLowerCase()) ?? [])
        .filter((bump) => bump.author === 'Bot' && bump.mergedAt >= since)
        .map((bump) => toBump(bump));

      return Promise.resolve(bumps.toSorted((first, second) => first.mergedAt - second.mergedAt));
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

function toTagKey(repo: RepoName, name: string): string {
  return `${repo.toLowerCase()} ${name}`;
}

function toBump(seeded: SeededBumps['bumps'][number]): MergedPullRequest {
  return {
    number: seeded.number,
    body: seeded.body,
    mergeCommit: seeded.mergeCommit,
    mergedAt: seeded.mergedAt,
  };
}
