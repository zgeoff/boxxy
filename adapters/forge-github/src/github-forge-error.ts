// A call that GitHub did not answer with a pull request or a clean miss: a status outside 2xx
// and 404, or a body of an unknown shape. The message holds the path and the status, never a header.
export class GithubForgeError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);

    this.name = 'GithubForgeError';
    this.status = status;
  }
}
