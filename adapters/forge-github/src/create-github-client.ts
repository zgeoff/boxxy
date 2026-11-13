import type { z } from 'zod';
import { apiVersion, forgeLimits } from './constants.ts';
import { GithubForgeError } from './github-forge-error.ts';
import type { GithubForgeOptions } from './types.ts';

type JsonBody = Readonly<Record<string, string>>;

interface GithubAnswer {
  readonly status: number;
  readonly body: unknown;
}

export interface GithubClient {
  // `null` for a 404
  readJson: <Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ) => Promise<z.infer<Schema> | null>;

  // pages until a short one, up to `maxPages`; a 404 in the middle of a list is an error
  readPages: <Item>(path: string, maxPages: number, schema: z.ZodType<Item[]>) => Promise<Item[]>;

  // one PUT with a JSON body; the caller reads every status, and a body that is not JSON is null
  writeJson: (path: string, body: JsonBody) => Promise<GithubAnswer>;
}

// Calls on the GitHub REST API. A read that fails for any reason but a 404 throws.
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

  const writeJson = async (path: string, body: JsonBody): Promise<GithubAnswer> => {
    const response = await options.fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    return { status: response.status, body: parseJsonText(text) };
  };

  return { readJson, readPages, writeJson };
}

function parseJsonText(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return null;
  }
}
