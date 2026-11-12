import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import invariant from 'tiny-invariant';
import { createSQLiteClaimStore } from '../create-sqlite-claim-store.ts';
import { seedV1ReviewCloseOut } from './seed-v1-review-close-out.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-v1-review-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const path = join(folder, 'store.db');

  const store = await createSQLiteClaimStore(path);

  onTestFinished(() => store.close());

  const dispatch = await createTestDispatch({ store });

  return {
    ...dispatch,
    path,
    seedReview: async () => {
      const rework = await dispatch.seedRework({});
      const attempts = await store.read((tx) => tx.listItemAttempts(rework.first.item));

      const review = attempts.find((attempt) => attempt.phase === 'review');

      invariant(review !== undefined, 'the rework follows a review');

      return review;
    },
  };
}

test('it stores the v1 body of a review, which the store reads back as the reading of its head', async () => {
  const ctx = await setupTest();
  const review = await ctx.seedReview();

  seedV1ReviewCloseOut(ctx.path, {
    attempt: review.id,
    closeOut: {
      verdict: {
        kind: 'changes-requested',
        findings: [
          { title: 'The menu ignores the theme', body: 'Read the theme.', path: 'src/menu.ts' },
        ],
      },
      noslop: {
        version: 7,
        reviewID: 'review-5d1e',
        head: 'a'.repeat(40),
        counts: { findings: 1, failedCalls: 0, fixChecks: 0 },
        reportBytes: 64,
        report: null,
      },
      friction: [],
      frictionDropped: 0,
    },
  });

  const stored = await ctx.readAttempt(review.id);

  const closeOut: unknown = stored.closeOut;

  expect(closeOut).toStrictEqual({
    round: null,
    cause: null,
    reading: {
      status: 'blocked',
      why: 'open-findings',
      head: 'a'.repeat(40),
      open: { high: 1, medium: 0, low: 0 },
      closedWithoutFix: 0,
      findingPaths: ['src/menu.ts'],
      cost: { calls: [] },
      ref: 'review-5d1e',
      answerHint:
        'Fix each of these findings:\n\n### The menu ignores the theme\nsrc/menu.ts\nRead the theme.',
    },
    unrelatedLines: null,
  });
});

test('it puts the v1 body in the close-out fact of the review', async () => {
  const ctx = await setupTest();
  const review = await ctx.seedReview();

  const closeOut = {
    verdict: { kind: 'passed' },
    noslop: {
      version: 7,
      reviewID: 'review-5d1e',
      head: 'a'.repeat(40),
      counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
      reportBytes: 2,
      report: {},
    },
    friction: [],
    frictionDropped: 0,
  };

  seedV1ReviewCloseOut(ctx.path, { attempt: review.id, closeOut });

  const facts = await ctx.listFacts('boxxy.attempt.closed_out');

  expect(facts.find((fact) => fact.factId === review.closeOutFact)?.payload).toStrictEqual({
    attempt: review.id,
    phase: 'review',
    closeOut,
    hash: expect.any(String),
  });
});
