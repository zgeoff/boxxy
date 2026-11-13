import type { CheckReading, CommitSha, RepoName } from '@boxxy/model';
import { forgeLimits } from '../constants.ts';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { collectCheckStates } from './collect-check-states.ts';
import type { CheckRunRow, CommitStatusRow } from './collect-check-states.ts';

// The latest run of each check name at `head`, from the check runs and the combined commit status.
// GitHub's combined status holds the latest status of each context.
export async function readChecks(
  client: GithubClient,
  repo: RepoName,
  head: CommitSha,
): Promise<ReadonlyMap<string, CheckReading>> {
  const checkRuns = await readCheckRuns(client, repo, head);
  const statuses = await readStatuses(client, repo, head);

  return collectCheckStates(checkRuns, statuses);
}

// Both endpoints wrap each page in an object with the total, so the array pager can't read them.
async function readCheckRuns(
  client: GithubClient,
  repo: RepoName,
  head: CommitSha,
): Promise<CheckRunRow[]> {
  const path = `/repos/${repo}/commits/${head}/check-runs`;
  const runs: CheckRunRow[] = [];

  for (let page = 1; page <= forgeLimits.maxCheckPages; page += 1) {
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

async function readStatuses(
  client: GithubClient,
  repo: RepoName,
  head: CommitSha,
): Promise<CommitStatusRow[]> {
  const path = `/repos/${repo}/commits/${head}/status`;
  const statuses: CommitStatusRow[] = [];

  for (let page = 1; page <= forgeLimits.maxCheckPages; page += 1) {
    const query = `per_page=${forgeLimits.pageSize}&page=${page}`;

    const answer = await client.readJson(`${path}?${query}`, githubSchemas.combinedStatus);

    if (answer === null) {
      throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
    }

    statuses.push(...answer.statuses);

    if (answer.statuses.length < forgeLimits.pageSize || statuses.length >= answer.total_count) {
      break;
    }
  }

  return statuses;
}
