import type { Instant, MergedPullRequest, RepoName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { forgeLimits } from '../constants.ts';
import type { GithubClient } from '../create-github-client.ts';
import { githubSchemas } from '../github-schemas.ts';

const botUserType = 'Bot';

// The Bot-authored pull requests merged at `since` or later, oldest merge first. The list is
// newest update first, and a pull request updates no earlier than it merged, so the read stops at
// the first page whose last pull request updated before `since`.
export async function readBumps(
  client: GithubClient,
  repo: RepoName,
  since: Instant,
): Promise<MergedPullRequest[]> {
  const bumps: MergedPullRequest[] = [];

  for (let page = 1; page <= forgeLimits.maxBumpPages; page += 1) {
    const path = `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${forgeLimits.pageSize}&page=${page}`;

    const rows = await client.readJson(path, githubSchemas.closedPullRequestPage);

    for (const row of rows ?? []) {
      const mergedAt = row.merged_at === null ? null : Date.parse(row.merged_at);

      if (
        mergedAt !== null &&
        mergedAt >= since &&
        row.merge_commit_sha !== null &&
        row.user?.type === botUserType
      ) {
        bumps.push({
          number: row.number,
          body: row.body ?? '',
          mergeCommit: brandSchemas.commitSha.parse(row.merge_commit_sha),
          mergedAt: brandSchemas.instant.parse(mergedAt),
        });
      }
    }

    const last = rows?.at(-1);

    if (
      rows === null ||
      rows.length < forgeLimits.pageSize ||
      (last !== undefined && Date.parse(last.updated_at) < since)
    ) {
      break;
    }
  }

  return bumps.toSorted((first, second) => first.mergedAt - second.mergedAt);
}
