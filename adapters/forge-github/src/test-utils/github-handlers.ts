import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import type { githubSchemas } from '../github-schemas.ts';

// The REST root that the tests give the forge, which only these handlers answer.
export const GITHUB_API_URL = 'https://api.github.test';

const recordID = z
  .number()
  .int()
  .positive()
  .default(() => faker.number.int({ min: 1, max: 999_999_999 }));

export const githubPullRequests = new Collection({
  schema: z.object({
    repo: z.string().default('acme/lamps'),
    number: recordID,
    id: recordID,
    body: z.string().nullable().default(null),
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

type PullRequestAnswer = z.input<typeof githubSchemas.pullRequest> &
  z.input<typeof githubSchemas.pullRequestBody>;

// Each route has its own depth, so the order of the array decides no match.
export const githubHandlers = [
  http.get(`${GITHUB_API_URL}/repos/:owner/:name/pulls/:number`, (info) => {
    const repo = `${String(info.params['owner'])}/${String(info.params['name'])}`;
    const number = Number(info.params['number']);
    const found = githubPullRequests.findFirst((query) => query.where({ repo, number }));

    if (found === undefined) {
      return HttpResponse.json(notFound, { status: 404 });
    }

    const answer: PullRequestAnswer = {
      id: found.id,
      html_url: `https://github.com/${repo}/pull/${number}`,
      state: 'open',
      merged_at: null,
      merge_commit_sha: null,
      body: found.body,
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${GITHUB_API_URL}/repos/:owner/:name/commits/:head/check-runs`, (info) => {
    const repo = `${String(info.params['owner'])}/${String(info.params['name'])}`;
    const head = String(info.params['head']);

    const search = new URL(info.request.url).searchParams;

    const perPage = Number(search.get('per_page') ?? '30');
    const page = Number(search.get('page') ?? '1');

    const runs = githubCheckRuns
      .findMany((query) => query.where({ repo, head }))
      .toSorted((first, second) => first.id - second.id);

    const answer: z.input<typeof githubSchemas.checkRunPage> = {
      total_count: runs.length,
      check_runs: runs.slice((page - 1) * perPage, page * perPage).map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
      })),
    };

    return HttpResponse.json(answer);
  }),
  http.get(`${GITHUB_API_URL}/repos/:owner/:name/commits/:head/status`, (info) => {
    const repo = `${String(info.params['owner'])}/${String(info.params['name'])}`;
    const head = String(info.params['head']);
    const statuses = githubCommitStatuses.findMany((query) => query.where({ repo, head }));

    const answer: z.input<typeof githubSchemas.combinedStatus> = {
      statuses: statuses.map((status) => ({ context: status.context, state: status.state })),
    };

    return HttpResponse.json(answer);
  }),
];

// Clears every collection. No collection references another, so the order is free.
export function resetGithub(): void {
  githubPullRequests.clear();
  githubCheckRuns.clear();
  githubCommitStatuses.clear();
}
