import { brandSchemas } from '@boxxy/model';
import { buildPullRequestRef } from './build-pull-request-ref.ts';
import { ControlConflictError } from './control-conflict-error.ts';
import type { VerifyHarness } from './types.ts';

// the head of the commit that answers the owner's findings
export const reworkHead = brandSchemas.commitSha.parse('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');

// Adds a commit to the opened pull request, with its checks green and no file changed since the
// head before it, as a build that answers findings pushes one.
export async function pushCommit(harness: VerifyHarness): Promise<{ head: string }> {
  const number = harness.openedPullRequest;

  if (number === null) {
    throw new ControlConflictError('no pull request is open: run hold-at-signoff first');
  }

  const forge = harness.server.forge;
  const target = buildPullRequestRef(number);

  const reading = await forge.readPullRequest(target.ref);

  const before = reading === 'not-found' ? undefined : reading.commits.at(-1)?.sha;

  if (reading === 'not-found' || before === undefined) {
    throw new ControlConflictError('the opened pull request has no commit to push after');
  }

  forge.seed({
    ...target,
    reading: {
      state: reading.state,
      mergedAt: reading.mergedAt,
      mergeCommit: reading.mergeCommit,
      commits: [...reading.commits, { sha: reworkHead, message: 'Answer the owner' }],
    },
  });

  forge.seedChecks({
    repo: target.ref.repo,
    head: reworkHead,
    checks: { 'pr / checks': 'success' },
  });

  forge.seedCompare({ repo: target.ref.repo, from: before, to: reworkHead, files: [] });

  return { head: reworkHead };
}
