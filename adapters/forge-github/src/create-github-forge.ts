import type { Forge, PullRequestRef } from '@boxxy/model';
import type { z } from 'zod';
import { apiVersion, forgeLimits } from './constants.ts';
import { GithubForgeError } from './github-forge-error.ts';
import { githubSchemas } from './github-schemas.ts';
import { toPullRequestReading } from './to-pull-request-reading.ts';
import type { GithubForgeOptions } from './types.ts';

// The `Forge` port on the GitHub REST API. A call that fails for any reason but a missing pull
// request throws, and the caller reads that as "the forge did not answer".
export function createGithubForge(options: GithubForgeOptions): Forge {
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': apiVersion,
    'user-agent': 'boxxy-forge-github',
    ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
  };

  // `null` for a 404
  const readJson = async <Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): Promise<z.infer<Schema> | null> => {
    const response = await options.fetch(`${baseUrl}${path}`, { method: 'GET', headers });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new GithubForgeError(
        `GitHub answered ${response.status} to GET ${path}`,
        response.status,
      );
    }

    const body: unknown = await response.json();

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new GithubForgeError(`GitHub gave an unknown body to GET ${path}`, response.status);
    }

    return parsed.data;
  };

  // pages until a short one, up to `maxPages`; a 404 in the middle of a list is an error
  const readPages = async <Item>(
    path: string,
    maxPages: number,
    schema: z.ZodType<Item[]>,
  ): Promise<Item[]> => {
    const items: Item[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const query = `per_page=${forgeLimits.pageSize}&page=${page}`;
      const separator = path.includes('?') ? '&' : '?';

      const rows = await readJson(`${path}${separator}${query}`, schema);

      if (rows === null) {
        throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
      }

      items.push(...rows);

      if (rows.length < forgeLimits.pageSize) {
        break;
      }
    }

    return items;
  };

  return {
    readPullRequest: async (ref) => {
      const path = toPullPath(ref);

      const pullRequest = await readJson(path, githubSchemas.pullRequest);

      if (pullRequest === null) {
        return 'not-found';
      }

      const commits = await readPages(
        `${path}/commits`,
        forgeLimits.maxCommitPages,
        githubSchemas.commitPage,
      );

      return toPullRequestReading(pullRequest, commits);
    },
    listOpenPullRequests: async (repo) => {
      const rows = await readPages(
        `/repos/${repo}/pulls?state=open&sort=created&direction=asc`,
        forgeLimits.maxListPages,
        githubSchemas.pullRequestPage,
      );

      return rows.map((row) => ({ repo, number: row.number }));
    },

    // GitHub's compare lists at most 300 files, and a paged compare lists them on its first page
    // only, so one call reads every file it gives
    readChangedFiles: async (repo, from, to) => {
      const path = `/repos/${repo}/compare/${from}...${to}`;

      const compare = await readJson(path, githubSchemas.compare);

      if (compare === null) {
        throw new GithubForgeError(`GitHub did not find GET ${path}`, 404);
      }

      return (compare.files ?? []).map((file) => ({
        path: file.filename,
        changedLines: file.changes,
      }));
    },
  };
}

function toPullPath(ref: PullRequestRef): string {
  if (!Number.isInteger(ref.number) || ref.number < 1) {
    throw new GithubForgeError(`not a pull request number: ${ref.number}`, null);
  }

  return `/repos/${ref.repo}/pulls/${ref.number}`;
}
