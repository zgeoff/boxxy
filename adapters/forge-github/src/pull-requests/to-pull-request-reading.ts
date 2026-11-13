import type { PullRequestReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { z } from 'zod';
import type { githubSchemas } from '../github-schemas.ts';

// A merged pull request is one with a merge time; GitHub reports it as `closed`.
export function toPullRequestReading(
  pullRequest: z.infer<typeof githubSchemas.pullRequest>,
  commits: z.infer<typeof githubSchemas.commitPage>,
): PullRequestReading {
  const mergedAt =
    pullRequest.merged_at === null
      ? null
      : brandSchemas.instant.parse(Date.parse(pullRequest.merged_at));

  return {
    url: pullRequest.html_url,
    githubId: pullRequest.id,
    state: mergedAt === null ? pullRequest.state : 'merged',
    base: pullRequest.base.ref,
    mergedAt,
    mergeCommit:
      mergedAt === null || pullRequest.merge_commit_sha === null
        ? null
        : brandSchemas.commitSha.parse(pullRequest.merge_commit_sha),
    commits: commits.map((commit) => ({
      sha: brandSchemas.commitSha.parse(commit.sha),
      message: commit.commit.message,
    })),
  };
}
