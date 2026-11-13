import { brandSchemas } from '@boxxy/model';
import { buildPullRequestRef } from './build-pull-request-ref.ts';
import { ControlConflictError } from './control-conflict-error.ts';
import type { VerifyHarness } from './types.ts';

const minuteMs = 60_000;

interface MergeInput {
  readonly number: number;
  readonly afterMinutes: number;
}

// Advances the clock, seeds the pull request as merged, runs one pass of the watch, and sends pepys
// the signed merge webhook.
export async function mergePullRequest(
  harness: VerifyHarness,
  input: MergeInput,
): Promise<{ mergedAt: string }> {
  const target = buildPullRequestRef(input.number);

  const openedAt = new Date(harness.server.dispatch.clock.now()).toISOString();

  const mergedAt = harness.server.dispatch.clock.advance(input.afterMinutes * minuteMs);

  const mergedAtText = new Date(mergedAt).toISOString();

  const mergeCommit = brandSchemas.commitSha.parse('d'.repeat(40));

  harness.server.forge.seed({
    ...target,
    reading: { state: 'merged', mergedAt, mergeCommit, commits: [] },
  });

  const watched = await harness.server.watch();

  if (watched.merged !== 1) {
    throw new ControlConflictError(`the watch saw ${watched.merged} merges, and 1 was due`);
  }

  const webhook = await harness.pepys.sendMergeWebhook({
    githubId: target.githubId,
    repo: target.ref.repo,
    number: input.number,
    title: 'the pull request of the journey',
    openedAt,
    mergedAt: mergedAtText,
    mergeCommit,
  });

  if (webhook.status !== 200) {
    throw new ControlConflictError(`pepys answered the merge webhook with ${webhook.status}`);
  }

  return { mergedAt: mergedAtText };
}
