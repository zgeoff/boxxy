import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { HttpResponse, http } from 'msw';
import type { PathParams } from 'msw';
import { z } from 'zod';
import type { githubSchemas } from '../github-schemas.ts';
import mergeAnswers from './fixtures/merge-answers.json' with { type: 'json' };

// The REST root that the tests give the forge, which only these handlers answer.
export const GITHUB_API_URL = 'https://api.github.test';

const recordID = z
  .number()
  .int()
  .positive()
  .default(() => faker.number.int({ min: 1, max: 999_999_999 }));

const commit = z.object({ sha: z.string(), message: z.string() });

// A pull request's head is its last commit. `mergeable` is GitHub's own field: `null` while
// GitHub works out whether the head merges into the base.
export const githubPullRequests = new Collection({
  schema: z.object({
    repo: z.string().default('acme/lamps'),
    number: recordID,
    id: recordID,
    title: z.string().default(() => faker.lorem.sentence()),
    body: z.string().nullable().default(null),
    state: z.enum(['open', 'closed']).default('open'),
    base: z.string().default('main'),
    mergedAt: z.string().nullable().default(null),
    mergeCommit: z.string().nullable().default(null),
    mergeable: z.boolean().nullable().default(true),
    commits: z.array(commit).default([]),

    // the type of the author's GitHub user, which is `Bot` for an App
    authorType: z.string().default('User'),

    // null reads as the merge time, or the time of the test
    updatedAt: z.string().nullable().default(null),
  }),
});

export const githubRepos = new Collection({
  schema: z.object({ repo: z.string() }),
});

export const githubTags = new Collection({
  schema: z.object({
    repo: z.string(),
    tag: z.string(),
    commit: z.string(),

    // an annotated tag's ref names a tag object, which names the commit
    annotated: z.boolean().default(false),
  }),
});

// the commits that the history of a ref holds
const historySchema = z.object({
  repo: z.string(),
  ref: z.string(),
  commits: z.array(z.string()),
});

export const githubHistories = new Collection({ schema: historySchema });

export const githubReleases = new Collection({
  schema: z.object({
    repo: z.string(),
    tag: z.string(),
    url: z.string(),
    draft: z.boolean().default(false),
    prerelease: z.boolean().default(false),
    publishedAt: z.string().nullable(),
  }),
});

const compareFile = z.object({ filename: z.string(), changes: z.number().int() });

export const githubCompares = new Collection({
  schema: z.object({
    repo: z.string().default('acme/lamps'),
    from: z.string(),
    to: z.string(),
    files: z.array(compareFile).default([]),
  }),
});

export const githubBranches = new Collection({
  schema: z.object({
    repo: z.string().default('acme/lamps'),
    name: z.string().default('main'),

    // null: the branch has no classic protection of its checks
    classicChecks: z.string().array().nullable().default(null),

    // the checks that the rulesets which target the branch require
    ruleChecks: z.string().array().default([]),
  }),
});

export const githubCheckRuns = new Collection({
  schema: z.object({
    repo: z.string().default('acme/lamps'),
    head: z.string().default(() => faker.git.commitSha()),
    id: recordID,
    name: z.string().default(() => faker.lorem.slug()),
    status: z.enum(['queued', 'in_progress', 'completed']).default('completed'),
    conclusion: z.string().nullable().default('success'),
  }),
});

export const githubCommitStatuses = new Collection({
  schema: z.object({
    repo: z.string().default('acme/lamps'),
    head: z.string().default(() => faker.git.commitSha()),
    context: z.string().default(() => faker.lorem.slug()),
    state: z.enum(['error', 'failure', 'pending', 'success']).default('success'),
  }),
});

const notFound = { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' };
const repos = `${GITHUB_API_URL}/repos/:owner/:name`;

const mergeRequest = z.object({
  sha: z.string(),
  merge_method: z.enum(['merge', 'squash', 'rebase']),
  commit_title: z.string().optional(),
});

type PullRequestAnswer = z.input<typeof githubSchemas.pullRequest> &
  z.input<typeof githubSchemas.pullRequestTitle> &
  z.input<typeof githubSchemas.pullRequestBody> &
  z.input<typeof githubSchemas.mergeability>;

// Each route has its own depth or method, so the order of the array decides no match.
export const githubHandlers = [
  http.get(`${repos}/pulls/:number`, (info) => {
    const found = findPullRequest(info.params);

    if (found === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: PullRequestAnswer = {
      id: found.id,
      html_url: `https://github.com/${found.repo}/pull/${found.number}`,
      state: found.state,
      base: { ref: found.base },
      merged_at: found.mergedAt,
      merge_commit_sha: found.mergeCommit,
      title: found.title,
      body: found.body,
      mergeable: found.state === 'open' ? found.mergeable : null,
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/pulls/:number/commits`, (info) => {
    const found = findPullRequest(info.params);

    if (found === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: z.input<typeof githubSchemas.commitPage> = slicePage(
      info.request,
      found.commits,
    ).map((row) => ({ sha: row.sha, commit: { message: row.message } }));

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/pulls`, (info) => {
    const repo = toRepo(info.params);

    if (new URL(info.request.url).searchParams.get('state') === 'closed') {
      const closed = githubPullRequests
        .findMany((query) => query.where({ repo, state: 'closed' }))
        .toSorted((first, second) => toUpdatedAt(second).localeCompare(toUpdatedAt(first)));

      const page: z.input<typeof githubSchemas.closedPullRequestPage> = slicePage(
        info.request,
        closed,
      ).map((row) => ({
        number: row.number,
        body: row.body,
        merged_at: row.mergedAt,
        merge_commit_sha: row.mergeCommit,
        updated_at: toUpdatedAt(row),
        user: { type: row.authorType },
      }));

      return HttpResponse.json(page);
    }

    const open = githubPullRequests
      .findMany((query) => query.where({ repo, state: 'open' }))
      .toSorted((first, second) => first.number - second.number);

    const answer: z.input<typeof githubSchemas.pullRequestPage> = slicePage(info.request, open).map(
      (row) => ({ number: row.number }),
    );

    return HttpResponse.json(answer);
  }),
  http.put(`${repos}/pulls/:number/merge`, async (info) => {
    const found = findPullRequest(info.params);

    if (found === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const sent: unknown = await info.request.json();

    const request = mergeRequest.safeParse(sent);

    if (!request.success) {
      return HttpResponse.json(mergeAnswers.invalidMethod, { status: 422 });
    }

    if (request.data.sha !== found.commits.at(-1)?.sha) {
      return HttpResponse.json(mergeAnswers.headMoved, { status: 409 });
    }

    if (found.state !== 'open' || found.mergeable !== true) {
      return HttpResponse.json(mergeAnswers.notMergeable, { status: 405 });
    }

    const mergeCommit = faker.git.commitSha();

    await githubPullRequests.update(found, {
      data: (row) => {
        row.state = 'closed';

        row.mergedAt = new Date().toISOString();

        row.mergeCommit = mergeCommit;
      },
    });

    return HttpResponse.json({ ...mergeAnswers.merged, sha: mergeCommit });
  }),
  http.get(`${repos}/compare/:range`, (info) => {
    const repo = toRepo(info.params);
    const [from = '', to = ''] = String(info.params['range']).split('...');
    const found = githubCompares.findFirst((query) => query.where({ repo, from, to }));

    if (found !== undefined) {
      const answer: z.input<typeof githubSchemas.compare> = { files: found.files };

      return HttpResponse.json(answer);
    }

    const history = githubHistories.findFirst((query) => query.where({ repo, ref: to }));

    if (history === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: z.input<typeof githubSchemas.compare> = {
      status: pickCompareStatus(history.commits, from, to),
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/git/ref/tags/*`, (info) => {
    const found = findTag(info.request, info.params);

    if (found === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: z.input<typeof githubSchemas.gitRef> = {
      object: found.annotated
        ? { sha: toTagObjectSha(found.commit), type: 'tag' }
        : { sha: found.commit, type: 'commit' },
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/git/tags/:sha`, (info) => {
    const sha = String(info.params['sha']);
    const repo = toRepo(info.params);
    const found = githubTags.findFirst((query) => query.where({ repo, annotated: true }));

    if (found === undefined || toTagObjectSha(found.commit) !== sha) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: z.input<typeof githubSchemas.gitTag> = {
      object: { sha: found.commit, type: 'commit' },
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/releases`, (info) => {
    const repo = toRepo(info.params);

    const answer: z.input<typeof githubSchemas.releasePage> = slicePage(
      info.request,
      githubReleases
        .findMany((query) => query.where({ repo }))
        .toSorted((first, second) =>
          (second.publishedAt ?? '9').localeCompare(first.publishedAt ?? '9'),
        ),
    ).map((row) => ({
      tag_name: row.tag,
      html_url: row.url,
      draft: row.draft,
      prerelease: row.prerelease,
      published_at: row.publishedAt,
    }));

    return HttpResponse.json(answer);
  }),
  http.get(repos, (info) => {
    const repo = toRepo(info.params);

    if (githubRepos.findFirst((query) => query.where({ repo })) === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: z.input<typeof githubSchemas.repository> = { full_name: repo };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/rules/branches/*`, (info) => {
    const found = findBranch(info.request, info.params, '/rules/branches/');

    const answer: z.input<typeof githubSchemas.branchRulePage> =
      found === undefined || found.ruleChecks.length === 0
        ? []
        : [
            {
              type: 'required_status_checks',
              parameters: {
                strict_required_status_checks_policy: false,
                required_status_checks: found.ruleChecks.map((context) => ({ context })),
              },
            },
          ];

    return HttpResponse.json(slicePage(info.request, answer));
  }),
  http.get(`${repos}/branches/*`, (info) => {
    const found = findBranch(info.request, info.params, '/branches/');

    if (found === undefined) {
      return HttpResponse.json({ ...notFound, message: 'Branch not found' }, { status: 404 });
    }

    const checks = found.classicChecks;

    const answer: z.input<typeof githubSchemas.branch> = {
      protection:
        checks === null
          ? { required_status_checks: { enforcement_level: 'off', contexts: [], checks: [] } }
          : {
              required_status_checks: {
                enforcement_level: 'non_admins',
                contexts: checks,
                checks: checks.map((context) => ({ context })),
              },
            },
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/commits/:head/check-runs`, (info) => {
    const repo = toRepo(info.params);
    const head = String(info.params['head']);

    const runs = githubCheckRuns
      .findMany((query) => query.where({ repo, head }))
      .toSorted((first, second) => first.id - second.id);

    const answer: z.input<typeof githubSchemas.checkRunPage> = {
      total_count: runs.length,
      check_runs: slicePage(info.request, runs).map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
      })),
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${repos}/commits/:head/status`, (info) => {
    const repo = toRepo(info.params);
    const head = String(info.params['head']);
    const statuses = githubCommitStatuses.findMany((query) => query.where({ repo, head }));

    const answer: z.input<typeof githubSchemas.combinedStatus> = {
      total_count: statuses.length,
      statuses: slicePage(info.request, statuses).map((status) => ({
        context: status.context,
        state: status.state,
      })),
    };

    return HttpResponse.json(answer);
  }),
];

// Clears every collection. No collection references another, so the order is free.
export function resetGithub(): void {
  githubPullRequests.clear();
  githubCompares.clear();
  githubBranches.clear();
  githubCheckRuns.clear();
  githubCommitStatuses.clear();
  githubRepos.clear();
  githubTags.clear();
  githubHistories.clear();
  githubReleases.clear();
}

function findPullRequest(params: PathParams) {
  const repo = toRepo(params);
  const number = Number(params['number']);

  return githubPullRequests.findFirst((query) => query.where({ repo, number }));
}

function toRepo(params: PathParams): string {
  return `${String(params['owner'])}/${String(params['name'])}`;
}

function slicePage<Item>(request: Request, items: readonly Item[]): Item[] {
  const search = new URL(request.url).searchParams;

  const perPage = Number(search.get('per_page') ?? '30');
  const page = Number(search.get('page') ?? '1');

  return items.slice((page - 1) * perPage, page * perPage);
}

interface UpdatedAtRow {
  readonly updatedAt: string | null;
  readonly mergedAt: string | null;
}

function toUpdatedAt(row: UpdatedAtRow): string {
  return row.updatedAt ?? row.mergedAt ?? new Date(0).toISOString();
}

function pickCompareStatus(commits: readonly string[], from: string, to: string) {
  if (from === to) {
    return 'identical';
  }

  return commits.includes(from) ? 'ahead' : 'diverged';
}

// A tag name can hold a slash, so the route takes the rest of the path.
function findTag(request: Request, params: PathParams) {
  const repo = toRepo(params);
  const marker = '/git/ref/tags/';

  const pathname = new URL(request.url).pathname;

  const tag = pathname
    .slice(pathname.indexOf(marker) + marker.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');

  return githubTags.findFirst((query) => query.where({ repo, tag }));
}

// the SHA of an annotated tag's own object, which the tests derive from its commit
function toTagObjectSha(sha: string): string {
  return `a${sha.slice(1)}`;
}

// A branch name can hold a slash, so the route takes the rest of the path after `marker`.
function findBranch(request: Request, params: PathParams, marker: string) {
  const repo = toRepo(params);

  const pathname = new URL(request.url).pathname;

  const encoded = pathname.slice(pathname.indexOf(marker) + marker.length);

  const name = encoded
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');

  return githubBranches.findFirst((query) => query.where({ repo, name }));
}
