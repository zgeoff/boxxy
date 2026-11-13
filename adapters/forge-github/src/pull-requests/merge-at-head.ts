import type { CommitSha, MergeAnswer, MergeMethod, PullRequestRef } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { toPullPath } from './to-pull-path.ts';

// One call, never retried here: the merge step sends a lost call again at the same head, and
// GitHub merges only while the head is still `sha`. GitHub answers 409 when the head moved and
// 405 when the pull request cannot merge, such as for a conflict or a closed pull request.
export async function mergeAtHead(
  client: GithubClient,
  ref: PullRequestRef,
  head: CommitSha,
  method: MergeMethod,
): Promise<MergeAnswer> {
  const path = `${toPullPath(ref)}/merge`;

  const answer = await client.writeJson(path, { sha: head, merge_method: method });

  if (answer.status === 409) {
    return { kind: 'head-moved' };
  }

  if (answer.status === 405) {
    const refusal = githubSchemas.refusal.safeParse(answer.body);

    return { kind: 'not-mergeable', reason: refusal.success ? refusal.data.message : '' };
  }

  if (answer.status !== 200) {
    throw new GithubForgeError(`GitHub answered ${answer.status} to PUT ${path}`, answer.status);
  }

  const merged = githubSchemas.merged.safeParse(answer.body);
  const mergeCommit = brandSchemas.commitSha.safeParse(merged.data?.sha);

  if (!mergeCommit.success) {
    throw new GithubForgeError(`GitHub gave an unknown body to PUT ${path}`, answer.status);
  }

  return { kind: 'merged', mergeCommit: mergeCommit.data };
}
