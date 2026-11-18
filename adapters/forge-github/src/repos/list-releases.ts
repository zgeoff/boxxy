import type { Release, RepoName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { forgeLimits } from '../constants.ts';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';

// One page of GitHub's releases, the published ones, newest first by their publish time.
export async function listReleases(client: GithubClient, repo: RepoName): Promise<Release[]> {
  const path = `/repos/${repo}/releases?per_page=${forgeLimits.pageSize}`;

  const rows = await client.readJson(path, githubSchemas.releasePage);

  if (rows === null) {
    throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
  }

  const releases = rows.flatMap((row): Release[] =>
    row.published_at === null
      ? []
      : [
          {
            tag: row.tag_name,
            url: row.html_url,
            draft: row.draft,
            prerelease: row.prerelease,
            publishedAt: brandSchemas.instant.parse(Date.parse(row.published_at)),
          },
        ],
  );

  return releases.toSorted((first, second) => second.publishedAt - first.publishedAt);
}
