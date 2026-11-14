import { buildPullRequestRef } from './build-pull-request-ref.ts';
import type { VerifyHarness } from './types.ts';

// Seeds the fake forge with the next pull request as open, before the build's hook links it.
export function openPullRequest(harness: VerifyHarness): { number: number } {
  const number = harness.nextPullRequest;

  harness.nextPullRequest += 1;
  harness.openedPullRequest = number;

  harness.server.forge.seed({
    ...buildPullRequestRef(number),
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  return { number };
}
