import type { CheckState, CommitSha, RepoName } from '@boxxy/model';
import { forgeLimits } from '../constants.ts';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { collectCheckStates } from './collect-check-states.ts';
import type { CheckRunRow } from './collect-check-states.ts';

// The latest run of each check name at `head`, from the check runs and the combined commit status.
// GitHub's combined status holds the latest status of each context.
export async function readChecks(
  client: GithubClient,
  repo: RepoName,
  head: CommitSha,
): Promise<ReadonlyMap<string, CheckState>> {
  const checkRuns = await readCheckRuns(client, repo, head);

  const statusPath = `/repos/${repo}/commits/${head}/status?per_page=${forgeLimits.pageSize}`;

  const combined = await client.readJson(statusPath, githubSchemas.combinedStatus);

  if (combined === null) {
    throw new GithubForgeError(`GitHub did not find GET ${statusPath}`, 404);
  }

  return collectCheckStates(checkRuns, combined.statuses);
}

// The check runs API wraps each page in an object with the total, so the array pager can't read it.
async function readCheckRuns(
  client: GithubClient,
  repo: RepoName,
  head: CommitSha,
): Promise<CheckRunRow[]> {
  const path = `/repos/${repo}/commits/${head}/check-runs`;
  const runs: CheckRunRow[] = [];

  for (let page = 1; page <= forgeLimits.maxCheckRunPages; page += 1) {
    const query = `filter=latest&per_page=${forgeLimits.pageSize}&page=${page}`;

    const answer = await client.readJson(`${path}?${query}`, githubSchemas.checkRunPage);

    if (answer === null) {
      throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
    }

    runs.push(...answer.check_runs);

    if (answer.check_runs.length < forgeLimits.pageSize || runs.length >= answer.total_count) {
      break;
    }
  }

  return runs;
}
