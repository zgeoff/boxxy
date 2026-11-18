import type { RepoName } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { githubSchemas } from '../github-schemas.ts';

// GitHub answers 404 to a repo that is missing and to one that the App cannot read.
export async function readRepo(
  client: GithubClient,
  repo: RepoName,
): Promise<'readable' | 'not-found'> {
  const found = await client.readJson(`/repos/${repo}`, githubSchemas.repository);

  return found === null ? 'not-found' : 'readable';
}
