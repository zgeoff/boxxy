import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toJSONValue } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import invariant from 'tiny-invariant';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-review-restart-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const before = await createTestCLI({ store });

  return {
    before,
    restart: () => createTestCLI({ restartOf: before.server }),
    claimReview: async () => {
      await before.server.dispatch.seedBuildWithPullRequest(before.server.forge, 7);

      const claim = await before.server.dispatch.claim();

      invariant(claim?.attempt.phase === 'review', 'the claim picks the review of the item');

      return before.server.dispatch.readAttempt(claim.attempt.id);
    },
  };
}

test('it records a review close-out sent again after a restart between the post and the store once, with no second review', async () => {
  const ctx = await setupTest();
  const review = await ctx.claimReview();

  const reading = buildMockGateReading({ status: 'passed' });
  const body = JSON.stringify(toJSONValue(reading));

  ctx.before.server.callerProof.setCaller(review.caller);

  const buildFacts = await ctx.before.server.dispatch.listFacts('boxxy.attempt.closed_out');

  const hold = ctx.before.server.dispatch.reviewGate.holdAfterNextPost();
  const lost = ctx.before.run(['attempt', 'close-out'], { stdin: body });

  await hold.entered;

  const after = await ctx.restart();

  after.server.callerProof.setCaller(review.caller);

  const sent = await after.run(['attempt', 'close-out'], { stdin: body });

  hold.release();

  const late = await lost;
  const stored = await after.server.dispatch.readAttempt(review.id);
  const allFacts = await after.server.dispatch.listFacts('boxxy.attempt.closed_out');

  const facts = allFacts.slice(buildFacts.length);

  const attempts = await after.server.deps.store.read((tx) => tx.listItemAttempts(review.item));

  expect({
    sent: [sent.exitCode, sent.stdout],
    late: [late.exitCode, late.stdout],
    posts:
      ctx.before.server.dispatch.reviewGate.posted.length +
      after.server.dispatch.reviewGate.posted.length,
    closeOut: stored.closeOut,
    facts: facts.length,
    reviews: attempts.filter((attempt) => attempt.phase === 'review').length,
  }).toStrictEqual({
    sent: [0, `${facts[0]?.factId}\n`],
    late: [0, `${facts[0]?.factId}\n`],
    posts: 2,
    closeOut: { round: 1, cause: 'first', reading, unrelatedLines: null },
    facts: 1,
    reviews: 1,
  });
});
