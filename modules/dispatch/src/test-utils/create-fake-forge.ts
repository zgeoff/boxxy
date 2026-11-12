import type { Forge, PullRequestReading, PullRequestRef, RepoName } from '@boxxy/model';

// A pull request as a test puts it on a forge. The url is the one GitHub gives.
export interface SeededPullRequest {
  readonly ref: PullRequestRef;
  readonly githubId: number;
  readonly reading: Omit<PullRequestReading, 'githubId' | 'url'>;
}

export interface ReadHold {
  readonly entered: Promise<void>;
  readonly release: () => void;
}

export interface FakeForge extends Forge {
  // every call, in order
  readonly calls: readonly string[];
  seed: (pullRequest: SeededPullRequest) => void;

  // while down, every call rejects, as a forge that does not answer
  setDown: (isDown: boolean) => void;

  // the next `readPullRequest` waits until the test calls `release`; `entered` resolves once that
  // read has started, so a test can change the store while the read is in flight
  holdNextRead: () => ReadHold;
}

// A forge that keeps the pull requests a test seeds and answers as the `Forge` contract says.
export function createFakeForge(): FakeForge {
  const pullRequests = new Map<string, SeededPullRequest>();

  const calls: string[] = [];
  let isDown = false;
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
  };
}

// GitHub matches a repo name in any case
function toKey(ref: PullRequestRef): string {
  return `${ref.repo.toLowerCase()}#${ref.number}`;
}
