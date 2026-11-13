import type { z } from 'zod';
import { apiVersion, forgeLimits } from './constants.ts';
import { GithubForgeError } from './github-forge-error.ts';
import type { GithubForgeOptions } from './types.ts';

export interface GithubClient {
  // `null` for a 404
  readJson: <Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ) => Promise<z.infer<Schema> | null>;

  // pages until a short one, up to `maxPages`; a 404 in the middle of a list is an error
  readPages: <Item>(path: string, maxPages: number, schema: z.ZodType<Item[]>) => Promise<Item[]>;
}

// GET calls on the GitHub REST API. A call that fails for any reason but a 404 throws.
export function createGithubClient(options: GithubForgeOptions): GithubClient {
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': apiVersion,
    'user-agent': 'boxxy-forge-github',
    ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
  };

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

  return { readJson, readPages };
}
