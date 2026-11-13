import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settleAttempt } from '@boxxy/dispatch';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import type { AttemptRow } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { runOutboxSender } from '@boxxy/server/test-utils/run-outbox-sender';
import { startPepysUnderTest } from '@boxxy/server/test-utils/start-pepys-under-test';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { seedV1ReviewCloseOut } from '@boxxy/store-sqlite/test-utils/seed-v1-review-close-out';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';
import { readJSONOutput } from '../src/test-utils/read-json-output.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-v1-review-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const path = join(folder, 'boxxy.db');

  const store = await createSQLiteClaimStore(path);

  onTestFinished(() => store.close());

  const pepys = await startPepysUnderTest();

  onTestFinished(() => pepys[Symbol.asyncDispose]());

  const cli = await createTestCLI({ store, pepys: pepys.reader });

  const server = cli.server;
  const dispatch = server.dispatch;

  const claim = async (phase: string): Promise<AttemptRow> => {
    const claimed = await dispatch.claim();

    invariant(claimed?.attempt.phase === phase, `the claim picks the ${phase} of the item`);

    return dispatch.readAttempt(claimed.attempt.id);
  };

  const runAs = (attempt: AttemptRow, argv: readonly string[], input: { stdin?: string } = {}) => {
    server.callerProof.setCaller(attempt.caller);

    return cli.run(argv, input);
  };

  const settle = async (attempt: AttemptRow) => {
    dispatch.clock.advance(60_000);

    await settleAttempt({
      store,
      attempt: attempt.id,
      forced: null,
      sessionStopped: true,
      rules: dispatch.rules(),
      actor: `boxxy:runner:${dispatch.runner}`,
      now: dispatch.clock.now(),
      newId: dispatch.newId,
    });

    dispatch.clock.advance(60_000);
  };

  return {
    ...cli,
    pepys,
    path,
    claim,
    runAs,
    settle,

    // a review of a built item with pull request 7 that asked for changes and settled; the test
    // then puts the v1 body in place of its close-out
    runChangesRequestedReview: async () => {
      await dispatch.seedBuildWithPullRequest(server.forge, 7);

      const review = await claim('review');

      const reading = buildMockGateReading({ status: 'blocked', why: 'open-findings' });

      await runAs(review, ['attempt', 'close-out'], {
        stdin: JSON.stringify(toJSONValue(reading)),
      });

      await settle(review);

      return dispatch.readAttempt(review.id);
    },
  };
}

test('it shows an item whose review a v1 server stored, with the review read as the reading of its head', async () => {
  const ctx = await setupTest();
  const review = await ctx.runChangesRequestedReview();

  seedV1ReviewCloseOut(ctx.path, {
    attempt: review.id,
    closeOut: {
      verdict: {
        kind: 'changes-requested',
        findings: [
          { title: 'The menu ignores the theme', body: 'Read it.', path: 'src/menu.ts', line: 12 },
          { title: 'No test of the dark theme', body: 'Add one.' },
        ],
      },
      noslop: {
        version: 7,
        reviewID: 'review-5d1e',
        head: 'a'.repeat(40),
        counts: { findings: 2, failedCalls: 0, fixChecks: 0 },
        reportBytes: 96,
        report: null,
      },
      friction: [],
      frictionDropped: 0,
    },
  });

  const shown = await ctx.run(['item', 'show', review.item]);

  const attemptSchema = z.object({ id: z.string(), closeOut: z.unknown() });
  const detail = readJSONOutput(shown, z.object({ attempts: z.array(attemptSchema) }));

  expect(detail.attempts.find((attempt) => attempt.id === review.id)?.closeOut).toStrictEqual({
    round: null,
    cause: null,
    reading: {
      status: 'blocked',
      why: 'open-findings',
      head: 'a'.repeat(40),
      open: { high: 2, medium: 0, low: 0 },
      closedWithoutFix: 0,
      findingPaths: ['src/menu.ts'],
      cost: { calls: [] },
      ref: 'review-5d1e',
      answerHint: [
        'Fix each of these findings:',
        '### The menu ignores the theme\nsrc/menu.ts:12\nRead it.',
        '### No test of the dark theme\nAdd one.',
      ].join('\n\n'),
    },
    unrelatedLines: null,
  });
});

test('it gives the next build the findings of a v1 review that asked for changes', async () => {
  const ctx = await setupTest();
  const review = await ctx.runChangesRequestedReview();

  seedV1ReviewCloseOut(ctx.path, {
    attempt: review.id,
    closeOut: {
      verdict: {
        kind: 'changes-requested',
        findings: [{ title: 'The menu ignores the theme', body: 'Read it.', path: 'src/menu.ts' }],
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

  const build = await ctx.claim('build');

  expect(build.input).toStrictEqual(
    expect.objectContaining({
      sentBack: {
        from: 'review',
        head: 'a'.repeat(40),
        open: { high: 1, medium: 0, low: 0 },
        answerHint:
          'Fix each of these findings:\n\n### The menu ignores the theme\nsrc/menu.ts\nRead it.',
      },
    }),
  );
});

test('it counts the unrelated lines of the review after a v1 review outside the files of its findings', async () => {
  const ctx = await setupTest();
  const review = await ctx.runChangesRequestedReview();

  seedV1ReviewCloseOut(ctx.path, {
    attempt: review.id,
    closeOut: {
      verdict: {
        kind: 'changes-requested',
        findings: [{ title: 'The menu ignores the theme', body: 'Read it.', path: 'src/menu.ts' }],
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

  const build = await ctx.claim('build');

  const recorded = await ctx.runAs(build, [
    'attempt',
    'evidence',
    '--kind',
    'test',
    '--ref',
    'menu.test.ts: reads the theme',
    '--observed',
    '4 passed',
  ]);

  const built = {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence: recorded.stdout.trim() }],
    openItems: [],
    friction: [],
  };

  await ctx.runAs(build, ['attempt', 'close-out'], { stdin: JSON.stringify(built) });
  await ctx.settle(build);

  const second = await ctx.claim('review');

  const reading = buildMockGateReading({ status: 'passed' });

  ctx.server.forge.seedCompare({
    repo: brandSchemas.repoName.parse('example/app'),
    from: brandSchemas.commitSha.parse('a'.repeat(40)),
    to: reading.head,
    files: [
      { path: 'src/menu.ts', changedLines: 6 },
      { path: 'src/app.ts', changedLines: 3 },
    ],
  });

  await ctx.runAs(second, ['attempt', 'close-out'], {
    stdin: JSON.stringify(toJSONValue(reading)),
  });

  const stored = await ctx.server.dispatch.readAttempt(second.id);

  expect(stored.closeOut).toStrictEqual({ round: 2, cause: 'rework', reading, unrelatedLines: 3 });
});

test('it sends the facts of an item with a v1 review to pepys, whose work fold reads the review', async () => {
  const ctx = await setupTest();
  const review = await ctx.runChangesRequestedReview();

  seedV1ReviewCloseOut(ctx.path, {
    attempt: review.id,
    closeOut: {
      verdict: {
        kind: 'changes-requested',
        findings: [{ title: 'The menu ignores the theme', body: 'Read it.', path: 'src/menu.ts' }],
      },
      noslop: {
        version: 7,
        reviewID: 'review-5d1e',
        head: 'a'.repeat(40),
        counts: { findings: 1, failedCalls: 0, fixChecks: 0 },
        reportBytes: 2,
        report: { findings: [] },
      },
      friction: [],
      frictionDropped: 0,
    },
  });

  const steps = await runOutboxSender({
    store: ctx.server.deps.store,
    sink: ctx.pepys.sink,
    clock: ctx.server.dispatch.clock,
  });

  const counts = await ctx.server.deps.store.read((tx) => tx.readOutboxCounts());
  const times = await ctx.run(['times', review.item]);

  const stepSchema = z.object({ step: z.string(), minutes: z.number().nullable() });
  const timesSchema = z.object({ steps: z.array(stepSchema) });

  const reviewStep = readJSONOutput(times, timesSchema).steps.find(
    (step) => step.step === 'review',
  );

  expect({ last: steps.at(-1), counts, review: reviewStep }).toStrictEqual({
    last: 'idle',
    counts: expect.objectContaining({ unsent: 0, parked: 0 }),
    review: { step: 'review', minutes: 1 },
  });
});
