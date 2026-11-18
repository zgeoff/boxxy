import type { CommitSha, RepoName } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { githubSchemas } from '../github-schemas.ts';

// The compare of the commit with the ref reads `ahead` when the ref holds commits that the commit
// lacks, and `identical` when they are the same commit; either way the ref holds the commit. A
// repo that holds no such commit or ref answers 404, which reads as not contained.
export async function probeContains(
  client: GithubClient,
  repo: RepoName,
  ref: string,
  commit: CommitSha,
): Promise<boolean> {
  const range = `${encodeURIComponent(commit)}...${encodeURIComponent(ref)}`;

  const compare = await client.readJson(`/repos/${repo}/compare/${range}`, githubSchemas.compare);

  return compare?.status === 'ahead' || compare?.status === 'identical';
}
