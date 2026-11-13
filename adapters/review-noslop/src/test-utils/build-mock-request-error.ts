// The shape of Octokit's request error, which noslop throws for an HTTP answer it does not expect:
// an `HttpError` with GitHub's status in `status`.
export function buildMockRequestError(status: number, message: string): Error {
  return Object.assign(new Error(message), { name: 'HttpError', status });
}
