import { expect, test } from 'bun:test';
import type { AttemptRow, CommitSha } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { claimNext } from '../claims/claim-next.ts';
import { watchPullRequests } from '../pull-requests/watch-pull-requests.ts';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createFakeVerifier } from '../test-utils/create-fake-verifier.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadJobRules } from '../test-utils/load-job-rules.ts';
import { timeouts } from '../timeouts.ts';
import { createMergeJob } from './create-merge-job.ts';
import { runJobReading } from './run-job-reading.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();
  const verifier = createFakeVerifier();
  const rules = loadJobRules();

  dispatch.setRules(rules);

  const now = dispatch.clock.now();

  await dispatch.store.exclusive((tx) => tx.syncLimits(rules.limits, now));

  const kind = rules.kinds.get(brandSchemas.itemKindName.parse('core.issue'));
  const step = kind?.pipeline.steps.find((candidate) => candidate.phase === 'merge');

  invariant(step !== undefined, 'the job rules have a merge step');

  const job = createMergeJob({ forge, verifier, store: dispatch.store });

  const claimMerge = () =>
    claimNext({
      store: dispatch.store,
      runner: dispatch.runner,
      rules: dispatch.rules(),
      backoff: dispatch.backoff,
      spawn: dispatch.spawn,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
    });

  const read = async (attempt: AttemptRow) => {
    const row = await dispatch.readAttempt(attempt.id);

    return runJobReading({
      store: dispatch.store,
      runner: dispatch.runner,
      job,
      rules,
      attempt: row,
      step,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
    });
  };

  return {
    ...dispatch,
    forge,
    verifier,
    claimMerge,
    read,
    readAfterWait: (attempt: AttemptRow) => {
      dispatch.clock.advance(timeouts.jobReadSeconds * 1000);

      return read(attempt);
    },
    watch: () =>
      watchPullRequests({
        store: dispatch.store,
        forge,
        rules,
        runner: dispatch.runner,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    readPullRequestRow: (number: number) =>
      dispatch.store.read((tx) =>
        tx.readPullRequestRow({ repo: brandSchemas.repoName.parse('example/app'), number }),
      ),

    // the item's review passes at the head, and the merge claims after it
    claimMergeAfterReview: async (head: CommitSha) => {
      const review = await dispatch.claim();

      invariant(review !== null, 'the review claims');

      const row = await dispatch.readAttempt(review.attempt.id);

      await dispatch.closeAndSettle(row, {
        round: 1,
        cause: 'first',
        reading: buildMockGateReading({ status: 'passed', head }),
        unrelatedLines: null,
      });

      const claim = await claimMerge();

      invariant(claim?.attempt.phase === 'merge', 'the merge claims after the passed review');

      return claim.attempt;
    },
  };
}

test('it merges a clean, green, verified head at the head it read', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });
  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);

  expect(ctx.forge.calls.filter((call) => call.startsWith('mergeAtHead'))).toStrictEqual([
    `mergeAtHead example/app#7 ${head} squash`,
  ]);
});

test('it settles a merged head as merged, with one merge fact and the row moved to merged', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });
  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);
  await ctx.readAfterWait(merge);

  const settled = await ctx.readAttempt(merge.id);
  const requested = await ctx.listFacts('boxxy.merge.requested');
  const answered = await ctx.listFacts('boxxy.merge.answered');
  const merged = await ctx.listFacts('boxxy.pull_request.merged');
  const row = await ctx.readPullRequestRow(7);

  const seen: unknown = {
    attempt: [settled.state, settled.outcome],
    requested: requested.length,
    answered: answered.map((fact) => fact.payload),
    merged: merged.length,
    row: row?.state,
  };

  expect(seen).toStrictEqual({
    attempt: ['succeeded', 'merged'],
    requested: 1,
    answered: [
      {
        attempt: merge.id,
        head,
        answer: 'merged',
        mergeCommit: expect.stringMatching(/^[0-9a-f]{40}$/u),
      },
    ],
    merged: 1,
    row: 'merged',
  });
});

test('it writes one merge fact when the watch records the merge before the settle', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });
  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);
  await ctx.watch();
  await ctx.readAfterWait(merge);

  const settled = await ctx.readAttempt(merge.id);
  const merged = await ctx.listFacts('boxxy.pull_request.merged');

  expect({ state: settled.state, merged: merged.length }).toStrictEqual({
    state: 'succeeded',
    merged: 1,
  });
});

test('it leaves the merge fact to the watch when the forge reads a merge with no merge commit yet', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');
  const mergeCommit = brandSchemas.commitSha.parse('ffeeddccbbaa99887766554433221100ffeeddcc');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'merged',
      mergedAt: brandSchemas.instant.parse(1_900_000_000_000),
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'merged',
      mergedAt: brandSchemas.instant.parse(1_900_000_000_000),
      mergeCommit,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  await ctx.watch();

  const settled = await ctx.readAttempt(merge.id);
  const merged = await ctx.listFacts('boxxy.pull_request.merged');

  const seen: unknown = {
    attempt: [settled.state, settled.outcome],
    merged: merged.map((fact) => fact.payload),
  };

  expect(seen).toStrictEqual({
    attempt: ['succeeded', 'merged'],
    merged: [expect.objectContaining({ number: 7, mergeCommit })],
  });
});

test('it writes one merge fact when the watch reads the pull request after the settle', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });
  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);
  await ctx.readAfterWait(merge);
  await ctx.watch();

  const merged = await ctx.listFacts('boxxy.pull_request.merged');

  expect(merged).toHaveLength(1);
});

test('it reads the required checks of the branch that the pull request merges into', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      base: 'release/2.0',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'release/2.0', checks: ['build'] });
  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'success' } });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);

  const row = await ctx.readAttempt(merge.id);

  expect([row.state, row.waitReason]).toStrictEqual(['running', 'checks pending']);
});

test('it settles repair when a required check is red at the head', async () => {
  const ctx = await setupTest();

  const repo = brandSchemas.repoName.parse('example/app');
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  ctx.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [{ sha: head, message: 'Dim the lamp' }],
    },
  });

  ctx.forge.seedRequiredChecks({ repo, branch: 'main', checks: [] });
  ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': 'failure' } });

  const merge = await ctx.claimMergeAfterReview(head);

  await ctx.read(merge);

  const row = await ctx.readAttempt(merge.id);

  const seen: unknown = {
    state: row.state,
    outcome: row.outcome,
    mergeCalls: ctx.forge.calls.filter((call) => call.startsWith('mergeAtHead')),
  };

  expect(seen).toStrictEqual({ state: 'failed', outcome: 'repair', mergeCalls: [] });
});

test('it throws on the read of a merge whose item has no pull request', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('merge') });

  const claim = await ctx.claimMerge();

  invariant(claim !== null, 'the seeded merge claims');

  expect(ctx.read(claim.attempt)).rejects.toThrow(/names no pull request/u);
});
