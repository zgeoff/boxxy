import type { CommitSha, MergeAnswer, MergeMethod, PullRequestRef } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { toPullPath } from './to-pull-path.ts';

// Reads the title, then sends one merge call, never retried here: the merge step sends a lost
// call again at the same head. GitHub answers 409 when the head moved and 405 when the pull
// request cannot merge. The title goes as `commit_title`, so a squash takes it as the subject.
export async function mergeAtHead(
  client: GithubClient,
  ref: PullRequestRef,
  head: CommitSha,
  method: MergeMethod,
): Promise<MergeAnswer> {
  const path = `${toPullPath(ref)}/merge`;

  const pullRequest = await client.readJson(toPullPath(ref), githubSchemas.pullRequestTitle);

  if (pullRequest === null) {
    throw new GithubForgeError(`GitHub did not find GET ${toPullPath(ref)}`, 404);
  }

  const answer = await client.writeJson(path, {
    sha: head,
    merge_method: method,
    commit_title: pullRequest.title,
  });

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
