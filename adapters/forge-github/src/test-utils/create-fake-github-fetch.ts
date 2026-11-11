import type { SeededPullRequest } from '@boxxy/dispatch/test-utils/create-fake-forge';
import type { ForgeFetch } from '../types.ts';

interface FakeGithubRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface FakeGithubFetch {
  readonly fetch: ForgeFetch;
  readonly requests: readonly FakeGithubRequest[];
  seed: (pullRequest: SeededPullRequest) => void;

  // every later call answers with the status and the body text
  answerWith: (status: number, body: string) => void;
}

// A GitHub REST API that serves the pull requests a test seeds: one pull request, its commits
// and the list of open ones, each by pages of the size in `per_page`.
export function createFakeGithubFetch(): FakeGithubFetch {
  const pullRequests: SeededPullRequest[] = [];
  const requests: FakeGithubRequest[] = [];
  let fixed: { readonly status: number; readonly body: string } | null = null;

  const read: ForgeFetch = (url, init) => {
    requests.push({ url, headers: init.headers });

    if (fixed !== null) {
      return Promise.resolve(new Response(fixed.body, { status: fixed.status }));
    }

    return Promise.resolve(answer(new URL(url), pullRequests));
  };

  return {
    fetch: read,
    requests,
    seed: (pullRequest) => {
      pullRequests.push(pullRequest);
    },
    answerWith: (status, body) => {
      fixed = { status, body };
    },
  };
}

const pullPattern =
  /^\/repos\/(?<repo>[^/]+\/[^/]+)\/pulls\/(?<number>\d+)(?<commits>\/commits)?$/u;

const listPattern = /^\/repos\/(?<repo>[^/]+\/[^/]+)\/pulls$/u;

function answer(url: URL, pullRequests: readonly SeededPullRequest[]): Response {
  const page = Number(url.searchParams.get('page') ?? '1');
  const perPage = Number(url.searchParams.get('per_page') ?? '30');

  const slice = <Item>(items: readonly Item[]): Item[] =>
    items.slice((page - 1) * perPage, page * perPage);

  const pull = pullPattern.exec(url.pathname);

  if (pull !== null) {
    const found = pullRequests.findLast(
      (candidate) =>
        candidate.ref.repo === pull.groups?.['repo'] &&
        candidate.ref.number === Number(pull.groups?.['number']),
    );

    if (found === undefined) {
      return Response.json({ message: 'Not Found' }, { status: 404 });
    }

    if (pull.groups?.['commits'] !== undefined) {
      return Response.json(
        slice(found.reading.commits).map((commit) => ({
          sha: commit.sha,
          commit: { message: commit.message },
        })),
      );
    }

    const merged = found.reading.state === 'merged';

    return Response.json({
      id: found.githubId,
      number: found.ref.number,
      html_url: `https://github.com/${found.ref.repo}/pull/${found.ref.number}`,
      state: found.reading.state === 'open' ? 'open' : 'closed',
      merged_at:
        found.reading.mergedAt === null ? null : new Date(found.reading.mergedAt).toISOString(),
      merge_commit_sha: merged ? found.reading.mergeCommit : null,
    });
  }

  const list = listPattern.exec(url.pathname);

  if (list !== null && url.searchParams.get('state') === 'open') {
    const open = pullRequests
      .filter(
        (candidate) =>
          candidate.ref.repo === list.groups?.['repo'] && candidate.reading.state === 'open',
      )
      .toSorted((first, second) => first.ref.number - second.ref.number);

    return Response.json(slice(open).map((candidate) => ({ number: candidate.ref.number })));
  }

  return Response.json({ message: 'Not Found' }, { status: 404 });
}
