import type { CommitSha, ItemId, PullRequestRef } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { createMergeJob } from '../jobs/create-merge-job.ts';
import { runJobReading } from '../jobs/run-job-reading.ts';
import { claimNextPick } from './claim-next-pick.ts';
import type { FakeForge } from './create-fake-forge.ts';
import { createFakeVerifier } from './create-fake-verifier.ts';
import type { TestDispatch } from './create-test-dispatch.ts';
import { loadJobRules } from './load-job-rules.ts';

export interface SeedSignoffWaitOptions {
  // the pull request number the build links; 7 when left out
  readonly number?: number;
}

export interface SeededSignoffWait {
  readonly item: ItemId;
  readonly head: CommitSha;
  readonly pullRequest: PullRequestRef;
}

// The head of the pull request that the item waits on
export const signoffWaitHead = brandSchemas.commitSha.parse(
  'e83c5163316f89bfbde7d9ab23ca2e25604af290',
);

// The path that the sign-off rule of the job rules matches
export const signoffMatchedPath = 'skills/testing/SKILL.md';

// An item whose pull request edits a path that a sign-off rule matches. It built, passed review at
// the head, and its merge attempt finished `needs-signoff`, so it stands at the sign-off hold.
// The dispatch carries the job rules with the sign-off rule after the call.
export async function seedSignoffWait(
  dispatch: TestDispatch,
  forge: FakeForge,
  options: SeedSignoffWaitOptions = {},
): Promise<SeededSignoffWait> {
  const rules = loadJobRules(undefined, { signoff: true });

  dispatch.setRules(rules);

  await dispatch.store.exclusive((tx) => tx.syncLimits(rules.limits, dispatch.clock.now()));

  const repo = brandSchemas.repoName.parse('example/app');
  const head = signoffWaitHead;
  const pullRequest = { repo, number: options.number ?? 7 };

  const build = await dispatch.seedBuildWithPullRequest(forge, pullRequest.number);

  forge.seed({
    ref: pullRequest,
    githubId: 9_000_000 + pullRequest.number,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Tighten the testing skill' }],
    },
  });

  forge.seedChangedFiles({ ref: pullRequest, files: [{ path: signoffMatchedPath }] });
  forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });
  forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  const review = await dispatch.claim();

  invariant(review !== null, 'the review claims');

  const reviewRow = await dispatch.readAttempt(review.attempt.id);

  await dispatch.closeAndSettle(reviewRow, {
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({ status: 'passed', head }),
    unrelatedLines: null,
  });

  const claim = await claimNextPick({
    store: dispatch.store,
    runner: dispatch.runner,
    rules: dispatch.rules(),
    backoff: dispatch.backoff,
    spawn: dispatch.spawn,
    now: dispatch.clock.now(),
    newId: dispatch.newId,
  });

  invariant(claim?.attempt.phase === 'merge', 'the merge claims after the passed review');

  const kind = rules.kinds.get(brandSchemas.itemKindName.parse('core.issue'));
  const step = kind?.pipeline.steps.find((candidate) => candidate.phase === 'merge');

  const mergeRow = await dispatch.readAttempt(claim.attempt.id);

  await runJobReading({
    store: dispatch.store,
    runner: dispatch.runner,
    job: createMergeJob({ forge, verifier: createFakeVerifier(), store: dispatch.store }),
    rules,
    attempt: mergeRow,
    step: step ?? null,
    now: dispatch.clock.now(),
    newId: dispatch.newId,
  });

  return { item: build.item, head, pullRequest };
}
