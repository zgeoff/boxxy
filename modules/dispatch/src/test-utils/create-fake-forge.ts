import type { Forge, PullRequestReading, PullRequestRef, RepoName } from '@boxxy/model';

// A pull request as a test puts it on a forge. The url is the one GitHub gives.
export interface SeededPullRequest {
  readonly ref: PullRequestRef;
  readonly githubId: number;
  readonly reading: Omit<PullRequestReading, 'githubId' | 'url'>;
}

export interface FakeForge extends Forge {
  // every call, in order
  readonly calls: readonly string[];
  seed: (pullRequest: SeededPullRequest) => void;

  // while down, every call rejects, as a forge that does not answer
  setDown: (isDown: boolean) => void;
}

// A forge that keeps the pull requests a test seeds and answers as the `Forge` contract says.
export function createFakeForge(): FakeForge {
  const pullRequests = new Map<string, SeededPullRequest>();

  const calls: string[] = [];
  let isDown = false;

  return {
    calls,
    seed: (pullRequest) => {
      pullRequests.set(toKey(pullRequest.ref), pullRequest);
    },
    setDown: (down) => {
      isDown = down;
    },
    readPullRequest: (ref) => {
      calls.push(`readPullRequest ${toKey(ref)}`);

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
        url: `https://github.com/${ref.repo}/pull/${ref.number}`,
      });
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
  };
}

function toKey(ref: PullRequestRef): string {
  return `${ref.repo}#${ref.number}`;
}
