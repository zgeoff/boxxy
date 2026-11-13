import type { PullRequestRef } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { toPullPath } from './to-pull-path.ts';

// GitHub gives `null` for a pull request with no description, which reads as empty. A missing
// pull request throws, because the caller asks only for one it holds.
export async function readPullRequestBody(
  client: GithubClient,
  ref: PullRequestRef,
): Promise<string> {
  const path = toPullPath(ref);

  const pullRequest = await client.readJson(path, githubSchemas.pullRequestBody);

  if (pullRequest === null) {
    throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
  }

  return pullRequest.body ?? '';
}
