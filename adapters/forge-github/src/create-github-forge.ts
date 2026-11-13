import type { Forge } from '@boxxy/model';
import { readChecks } from './checks/read-checks.ts';
import { forgeLimits } from './constants.ts';
import { createGithubClient } from './create-github-client.ts';
import { GithubForgeError } from './github-forge-error.ts';
import { githubSchemas } from './github-schemas.ts';
import { readPullRequestBody } from './pull-requests/read-pull-request-body.ts';
import { toPullPath } from './pull-requests/to-pull-path.ts';
import { toPullRequestReading } from './pull-requests/to-pull-request-reading.ts';
import type { GithubForgeOptions } from './types.ts';

// The `Forge` port on the GitHub REST API. A call that fails for any reason but a missing pull
// request throws, and the caller reads that as "the forge did not answer".
export function createGithubForge(options: GithubForgeOptions): Forge {
  const client = createGithubClient(options);

  return {
    readPullRequest: async (ref) => {
      const path = toPullPath(ref);

      const pullRequest = await client.readJson(path, githubSchemas.pullRequest);

      if (pullRequest === null) {
        return 'not-found';
      }

      const commits = await client.readPages(
        `${path}/commits`,
        forgeLimits.maxCommitPages,
        githubSchemas.commitPage,
      );

      return toPullRequestReading(pullRequest, commits);
    },
    listOpenPullRequests: async (repo) => {
      const rows = await client.readPages(
        `/repos/${repo}/pulls?state=open&sort=created&direction=asc`,
        forgeLimits.maxListPages,
        githubSchemas.pullRequestPage,
      );

      return rows.map((row) => ({ repo, number: row.number }));
    },
    readPullRequestBody: (ref) => readPullRequestBody(client, ref),
    readChecks: (repo, head) => readChecks(client, repo, head),

    // GitHub's compare lists at most 300 files, and a paged compare lists them on its first page
    // only, so one call reads every file it gives
    readChangedFiles: async (repo, from, to) => {
      const path = `/repos/${repo}/compare/${from}...${to}`;

      const compare = await client.readJson(path, githubSchemas.compare);

      if (compare === null) {
        throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
      }

      return (compare.files ?? []).map((file) => ({
        path: file.filename,
        changedLines: file.changes,
      }));
    },
  };
}
