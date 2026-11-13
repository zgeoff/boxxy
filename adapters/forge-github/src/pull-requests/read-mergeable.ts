import type { MergeableState, PullRequestRef } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { toPullPath } from './to-pull-path.ts';

// GitHub works the mergeable state out in the background after a push, and answers `null` until
// it has. A missing pull request throws, because the caller asks only for one it holds.
export async function readMergeable(
  client: GithubClient,
  ref: PullRequestRef,
): Promise<MergeableState> {
  const path = toPullPath(ref);

  const pullRequest = await client.readJson(path, githubSchemas.mergeability);

  if (pullRequest === null) {
    throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
  }

  if (pullRequest.mergeable === null) {
    return 'unknown';
  }

  return pullRequest.mergeable ? 'clean' : 'conflict';
}
