import type { PullRequestRef } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

const pathPattern = /^\/(?<owner>[^/]+)\/(?<name>[^/]+)\/pull\/(?<number>\d+)(?:\/.*)?$/u;

// The repo and number a pull request URL names, or null for any other URL. The host is not
// checked: the forge decides which host it serves, and the stored URL comes from the forge.
export function parsePullRequestUrl(url: string): PullRequestRef | null {
  const parsed = URL.parse(url);

  if (parsed === null || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return null;
  }

  const match = pathPattern.exec(parsed.pathname);

  if (match === null) {
    return null;
  }

  const repo = brandSchemas.repoName.safeParse(
    `${match.groups?.['owner']}/${match.groups?.['name']}`,
  );

  const number = Number(match.groups?.['number']);

  return repo.success && Number.isSafeInteger(number) && number > 0
    ? { repo: repo.data, number }
    : null;
}
