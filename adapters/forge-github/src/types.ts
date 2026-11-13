interface ForgeRequestInit {
  readonly method: 'GET' | 'PUT';
  readonly headers: Readonly<Record<string, string>>;

  // JSON text; only a merge sends a body
  readonly body?: string;
}

// The one call the adapter needs, shaped as the platform's `fetch` takes it.
export type ForgeFetch = (url: string, init: ForgeRequestInit) => Promise<Response>;

export interface GithubForgeOptions {
  readonly fetch: ForgeFetch;

  // the REST root, such as `https://api.github.com`; a deployment points it at its broker
  readonly baseUrl: string;

  // Read before each call, and sent as a bearer token, such as the App installation token that
  // `createGithubAppAuth` mints. A deployment whose broker adds the credential on the way out
  // leaves it out. The adapter never logs the token and never puts it in an error.
  readonly readToken?: () => Promise<string>;
}
