import type { CommitSha, RepoName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';

// an annotated tag points at a tag object, which points at the commit, or at another tag
const maxTagDepth = 5;

// The commit that the tag names, through any annotated tag objects; null for no such tag.
export async function readTag(
  client: GithubClient,
  repo: RepoName,
  tag: string,
): Promise<CommitSha | null> {
  const encoded = tag
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const ref = await client.readJson(`/repos/${repo}/git/ref/tags/${encoded}`, githubSchemas.gitRef);

  if (ref === null) {
    return null;
  }

  let target = ref.object;

  for (let depth = 0; depth < maxTagDepth && target.type === 'tag'; depth += 1) {
    const path = `/repos/${repo}/git/tags/${target.sha}`;

    const object = await client.readJson(path, githubSchemas.gitTag);

    if (object === null) {
      throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
    }

    target = object.object;
  }

  if (target.type !== 'commit') {
    throw new GithubForgeError(`the tag ${tag} of ${repo} does not name a commit`, null);
  }

  return brandSchemas.commitSha.parse(target.sha);
}
