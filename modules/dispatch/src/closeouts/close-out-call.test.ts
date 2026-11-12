import { expect, test } from 'bun:test';
import type { AttemptRow, GateReading } from '@boxxy/model';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { closeOutCall } from './close-out-call.ts';
import { settleAttempt } from './settle-attempt.ts';
import type { CallRef } from './types.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();

  const closeOutAs = (call: CallRef, body: unknown) =>
    closeOutCall({
      store: dispatch.store,
      call,
      body,
      rules: dispatch.rules(),
      now: dispatch.clock.now(),
      newId: dispatch.newId,
      review: { gate: dispatch.reviewGate, forge },
    });

  const claimReview = async (): Promise<AttemptRow> => {
    const claim = await dispatch.claim();

    invariant(claim?.attempt.phase === 'review', 'the claim picks the review of the item');

    return dispatch.readAttempt(claim.attempt.id);
  };

  return {
    ...dispatch,
    forge,
    repo: brandSchemas.repoName.parse('example/app'),
    claimReview,
    closeOut: (attempt: AttemptRow, body: unknown) =>
      closeOutAs(dispatch.buildCallRef(attempt), body),
    closeOutAs,
    settle: (attempt: AttemptRow) =>
      settleAttempt({
        store: dispatch.store,
        attempt: attempt.id,
        forced: null,
        sessionStopped: true,
        rules: dispatch.rules(),
        actor: 'boxxy:runner:runner-1',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    toBody: (reading: GateReading) => toJSONValue(reading),
  };
}

test('it posts a first review through the gate and stores its reading with no unrelated lines', async () => {
  const ctx = await setupTest();

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  const review = await ctx.claimReview();

  const reading = buildMockGateReading({ status: 'passed' });

  const answer = await ctx.closeOut(review, ctx.toBody(reading));
  const stored = await ctx.readAttempt(review.id);

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: review.id,
    factId: expect.any(String),
    repeat: false,
  });

  expect(stored.closeOut).toStrictEqual({
    round: 1,
    cause: 'first',
    reading,
    unrelatedLines: null,
  });

  expect(ctx.reviewGate.posted).toStrictEqual([
    {
      round: {
        attempt: review.id,
        pullRequest: { repo: ctx.repo, number: 7 },
        round: 1,
        cause: 'first',
      },
      result: ctx.toBody(reading),
    },
  ]);
});

test('it counts the unrelated lines of a later review from the forge compare of the two heads', async () => {
  const ctx = await setupTest();

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  const first = await ctx.claimReview();

  const earlier = buildMockGateReading({
    status: 'blocked',
    why: 'failed-call',
    findingPaths: ['src/theme.ts'],
  });

  await ctx.closeOut(first, ctx.toBody(earlier));
  await ctx.settle(first);

  const second = await ctx.claimReview();

  const reading = buildMockGateReading({ status: 'passed' });

  ctx.forge.seedCompare({
    repo: ctx.repo,
    from: earlier.head,
    to: reading.head,
    files: [
      { path: 'src/theme.ts', changedLines: 9 },
      { path: 'src/menu.ts', changedLines: 4 },
      { path: 'docs/theme.md', changedLines: 2 },
    ],
  });

  await ctx.closeOut(second, ctx.toBody(reading));

  const stored = await ctx.readAttempt(second.id);

  expect(stored.closeOut).toStrictEqual({ round: 1, cause: 'recheck', reading, unrelatedLines: 6 });
});

test('it records no unrelated lines, and reads no compare, after a review that covered no head', async () => {
  const ctx = await setupTest();

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  const first = await ctx.claimReview();

  await ctx.closeOut(first, ctx.toBody(buildMockGateReading({ status: 'not-covered' })));
  await ctx.settle(first);

  const second = await ctx.claimReview();

  await ctx.closeOut(second, ctx.toBody(buildMockGateReading({ status: 'passed' })));

  const stored = await ctx.readAttempt(second.id);

  expect([stored.closeOut, ctx.forge.calls]).toStrictEqual([
    expect.objectContaining({ cause: 'recheck', unrelatedLines: null }),
    ['readPullRequest example/app#7'],
  ]);
});

test('it answers a repeat of a stored body as a repeat, and the gate posts it only once', async () => {
  const ctx = await setupTest();

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  const review = await ctx.claimReview();

  const body = ctx.toBody(buildMockGateReading({ status: 'passed' }));

  const first = await ctx.closeOut(review, body);
  const repeat = await ctx.closeOut(review, body);

  invariant(first.kind === 'recorded', 'the first close-out records');

  expect([repeat, ctx.reviewGate.posted.length]).toStrictEqual([{ ...first, repeat: true }, 1]);
});

test('it refuses a close-out from another caller, and the gate posts nothing', async () => {
  const ctx = await setupTest();

  await ctx.seedBuildWithPullRequest(ctx.forge, 7);

  const review = await ctx.claimReview();

  const call = ctx.buildCallRef(review);

  const answer = await ctx.closeOutAs(
    { ...call, caller: { issuer: call.caller.issuer, subject: 'another-session' } },
    ctx.toBody(buildMockGateReading({ status: 'passed' })),
  );

  const after = await ctx.readAttempt(review.id);

  expect([answer, ctx.reviewGate.posted, after.closeOut]).toStrictEqual([
    { kind: 'refused', reason: 'no-attempt' },
    [],
    null,
  ]);
});

test('it rejects the close-out of a review of an item with no pull request, and posts nothing', async () => {
  const ctx = await setupTest();

  await ctx.seedBuild();

  const review = await ctx.claimReview();
  const answer = await ctx.closeOut(review, ctx.toBody(buildMockGateReading({ status: 'passed' })));

  expect([answer, ctx.reviewGate.posted]).toStrictEqual([
    {
      kind: 'rejected',
      problems: [{ kind: 'phase-rule', message: 'the review has no pull request to review' }],
    },
    [],
  ]);
});

test('it rejects a review close-out on a server with no review gate, and records nothing', async () => {
  const ctx = await setupTest();

  await ctx.seedBuild();

  const review = await ctx.claimReview();

  const answer = await closeOutCall({
    store: ctx.store,
    call: ctx.buildCallRef(review),
    body: {
      round: 1,
      cause: 'first',
      reading: ctx.toBody(buildMockGateReading({ status: 'passed' })),
      unrelatedLines: null,
    },
    rules: ctx.rules(),
    now: ctx.clock.now(),
    newId: ctx.newId,
    review: null,
  });

  const after = await ctx.readAttempt(review.id);

  expect([answer, after.closeOut]).toStrictEqual([
    {
      kind: 'rejected',
      problems: [{ kind: 'phase-rule', message: 'this server has no review gate' }],
    },
    null,
  ]);
});

test('it records the close-out of another phase as it is sent', async () => {
  const ctx = await setupTest();
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('design') });
  const claim = await ctx.claim();

  invariant(claim?.attempt.item === item, 'the claim picks the seeded design');

  const design = await ctx.readAttempt(claim.attempt.id);

  await ctx.closeOut(design, {
    result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
    friction: [],
  });

  const stored = await ctx.readAttempt(design.id);

  expect([stored.closeOut, ctx.reviewGate.posted]).toStrictEqual([
    {
      result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
      friction: [],
      frictionDropped: 0,
    },
    [],
  ]);
});
