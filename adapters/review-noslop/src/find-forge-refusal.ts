// Octokit's request error holds GitHub's HTTP status in `status`, and noslop keeps it in the cause
// of the error it throws; a network failure has status 500. Only a 4xx refusal that a second send
// gets again finds a reason: a rate limit, as noslop's own retry reads one, finds none.
export function findForgeRefusal(error: unknown): string | null {
  const answer = findRequestError(error, new Set());

  if (answer === null || answer.status < 400 || answer.status > 499 || isRateLimit(answer)) {
    return null;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/rate limit/iu.test(message)) {
    return null;
  }

  return `GitHub answered ${answer.status} to the noslop App: ${message}`;
}

interface RequestError {
  readonly status: number;
  readonly headers: Readonly<Record<string, unknown>>;
}

function findRequestError(error: unknown, seen: Set<unknown>): RequestError | null {
  if (!(error instanceof Error) || seen.has(error)) {
    return null;
  }

  seen.add(error);

  if (!('status' in error) || typeof error.status !== 'number') {
    return findRequestError(error.cause, seen);
  }

  const response = 'response' in error ? error.response : null;

  const headers =
    typeof response === 'object' && response !== null && 'headers' in response
      ? response.headers
      : null;

  return {
    status: error.status,
    headers: typeof headers === 'object' && headers !== null ? { ...headers } : {},
  };
}

// GitHub marks a rate limit with 429, a `retry-after` header, or no requests left in the window
function isRateLimit(answer: RequestError): boolean {
  return (
    answer.status === 429 ||
    answer.headers['retry-after'] !== undefined ||
    answer.headers['x-ratelimit-remaining'] === '0'
  );
}
