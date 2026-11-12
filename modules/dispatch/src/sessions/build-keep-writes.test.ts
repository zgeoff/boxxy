import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadVerifyRules } from '../test-utils/load-verify-rules.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const claimAttempt = async (): Promise<AttemptRow> => {
    const claim = await dispatch.claim();

    invariant(claim !== null, 'the claim picks the seeded item');

    return dispatch.readAttempt(claim.attempt.id);
  };

  return {
    ...dispatch,
    claimAttempt,

    // the item's review claims, passes and settles, and its verify claims
    claimVerify: async (): Promise<AttemptRow> => {
      const review = await claimAttempt();

      await dispatch.closeAndSettle(review, {
        round: 1,
        cause: 'first',
        reading: buildMockGateReading({ status: 'passed' }),
        unrelatedLines: null,
      });

      return claimAttempt();
    },
    listKeptAttempts: async () => {
      const kept = await dispatch.store.read((tx) => tx.listKeptSessions());

      return kept.map((entry) => entry.kept.attempt);
    },
  };
}

test('it keeps the build session for a builder grader when no edge resumes the build', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: false }));

  const build = await ctx.seedBuild();
  const kept = await ctx.listKeptAttempts();

  expect(kept).toStrictEqual([build.id]);
});

test('it keeps no build session for a fresh grader when no edge resumes the build', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'fresh', resume: false }));

  await ctx.seedBuild();

  const kept = await ctx.listKeptAttempts();

  expect(kept).toStrictEqual([]);
});

test('it keeps the session of a builder verify that settles failed', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: true }));

  await ctx.seedBuild();

  const verify = await ctx.claimVerify();

  await ctx.closeAndSettle(verify, {
    result: { kind: 'failed', features: ['upload-retry'] },
    friction: [],
  });

  const kept = await ctx.listKeptAttempts();

  expect(kept).toStrictEqual([verify.id]);
});

test('it keeps the build session over a fresh verify that settles failed', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'fresh', resume: true }));

  const build = await ctx.seedBuild();
  const verify = await ctx.claimVerify();

  await ctx.closeAndSettle(verify, {
    result: { kind: 'failed', features: ['upload-retry'] },
    friction: [],
  });

  const kept = await ctx.listKeptAttempts();

  expect(kept).toStrictEqual([build.id]);
});

test('it keeps no session of a builder verify that settles blocked', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: true }));

  await ctx.seedBuild();

  const verify = await ctx.claimVerify();

  await ctx.closeAndSettle(verify, {
    result: { kind: 'blocked', question: 'Which theme is the default?' },
    friction: [],
  });

  const kept = await ctx.listKeptAttempts();

  expect(kept).toStrictEqual([]);
});
