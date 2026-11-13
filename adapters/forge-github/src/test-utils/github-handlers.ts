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
    body: z.string().nullable().default(null),
    state: z.enum(['open', 'closed']).default('open'),
    base: z.string().default('main'),
    mergedAt: z.string().nullable().default(null),
    mergeCommit: z.string().nullable().default(null),
    mergeable: z.boolean().nullable().default(true),
    commits: z.array(commit).default([]),
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
});

type PullRequestAnswer = z.input<typeof githubSchemas.pullRequest> &
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

    if (found === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: z.input<typeof githubSchemas.compare> = { files: found.files };

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
