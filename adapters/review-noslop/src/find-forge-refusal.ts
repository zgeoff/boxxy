// Octokit's request error holds GitHub's HTTP status in `status`, and noslop keeps it in the cause
// of the error it throws; a network failure has status 500. Only a 4xx refusal that a second send
// gets again finds a reason: a rate limit (429, or a 403 that says so) finds none.
export function findForgeRefusal(error: unknown): string | null {
  const status = findStatus(error, new Set());

  if (status === null || status < 400 || status > 499 || status === 429) {
    return null;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/rate limit/iu.test(message)) {
    return null;
  }

  return `GitHub answered ${status} to the noslop App: ${message}`;
}

function findStatus(error: unknown, seen: Set<unknown>): number | null {
  if (!(error instanceof Error) || seen.has(error)) {
    return null;
  }

  seen.add(error);

  return 'status' in error && typeof error.status === 'number'
    ? error.status
    : findStatus(error.cause, seen);
}
