import type { ChangedPathsReading, PullRequestRef } from '@boxxy/model';
import { forgeLimits } from '../constants.ts';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { toPullPath } from './to-pull-path.ts';

// GitHub's file list of a pull request pages up to 3,000 files, where its compare lists 300. The
// list is short of the pull request's own count when a read ends at the page limit.
export async function readChangedPaths(
  client: GithubClient,
  ref: PullRequestRef,
): Promise<ChangedPathsReading> {
  const path = toPullPath(ref);

  const count = await client.readJson(path, githubSchemas.pullRequestFileCount);

  if (count === null) {
    throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
  }

  const files = await client.readPages(
    `${path}/files`,
    forgeLimits.maxFilePages,
    githubSchemas.pullRequestFilePage,
  );

  const paths = files.flatMap((file) =>
    file.previous_filename === undefined
      ? [file.filename]
      : [file.filename, file.previous_filename],
  );

  return {
    paths: [...new Set(paths)],
    changedFiles: count.changed_files,
    truncated: files.length < count.changed_files,
  };
}
