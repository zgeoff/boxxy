import type { PullRequestAuthor } from './parse-pull-request-event.ts';

// The REST login of the Renovate app's bot account, as a pull_request event names it.
const renovateLogin = 'zgeoff-renovate[bot]';

interface PullRequestOrigin {
  readonly headRef: string;
  readonly author: PullRequestAuthor | null;
}

// Renovate's bot changes only dependency versions, and nobody runs a journey on its pull requests,
// so their bodies never hold a report. A person's `renovate/` branch still meets the gate.
export function isRenovatePullRequest(pullRequest: PullRequestOrigin): boolean {
  return (
    pullRequest.headRef.startsWith('renovate/') &&
    pullRequest.author?.type === 'Bot' &&
    pullRequest.author.login === renovateLogin
  );
}
