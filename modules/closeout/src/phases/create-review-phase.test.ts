import { expect, mock, test } from 'bun:test';
import type { GateRound } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';
import { createReviewPhase } from './create-review-phase.ts';

function setupTest() {
  const buildCommand = mock((round: GateRound) => `review ${round.cause} ${round.round}`);

  return { buildCommand, review: createReviewPhase({ buildCommand }) };
}

test('it gives the first review of a pull request round 1, cause first, and the gate command', () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow().id;
  const pullRequest = buildMockV1PullRequestRow();

  const input = ctx.review.input({
    item: buildMockV1ItemView(),
    attempt,
    history: [buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 1000 })],
    retries: [],
    pullRequests: [pullRequest],
    session: null,
  });

  expect(input).toStrictEqual({
    pullRequest: { repo: pullRequest.repo, number: pullRequest.number },
    round: 1,
    cause: 'first',
    command: 'review first 1',
  });

  expect(ctx.buildCommand.mock.calls).toStrictEqual([
    [
      {
        attempt,
        pullRequest: { repo: pullRequest.repo, number: pullRequest.number },
        round: 1,
        cause: 'first',
      },
    ],
  ]);
});

test('it gives the review after a review that asked for changes round 2 and cause rework', () => {
  const ctx = setupTest();

  const input = ctx.review.input({
    item: buildMockV1ItemView(),
    attempt: buildMockV1AttemptRow().id,
    history: [
      buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 1000 }),
      buildMockSettledAttemptRow({ phase: 'review', outcome: 'changes-requested', endedAt: 2000 }),
      buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 3000 }),
    ],
    retries: [],
    pullRequests: [buildMockV1PullRequestRow()],
    session: null,
  });

  expect(input).toStrictEqual(
    expect.objectContaining({ round: 2, cause: 'rework', command: 'review rework 2' }),
  );
});

test('it counts no review that settled before the latest retry', () => {
  const ctx = setupTest();

  const input = ctx.review.input({
    item: buildMockV1ItemView(),
    attempt: buildMockV1AttemptRow().id,
    history: [
      buildMockSettledAttemptRow({ phase: 'review', outcome: 'changes-requested', endedAt: 1000 }),
      buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 2000 }),
      buildMockSettledAttemptRow({ phase: 'review', outcome: 'changes-requested', endedAt: 3000 }),
      buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 5000 }),
    ],
    retries: [
      { at: brandSchemas.instant.parse(4000), phase: brandSchemas.phaseName.parse('build') },
    ],
    pullRequests: [buildMockV1PullRequestRow()],
    session: null,
  });

  expect(input).toStrictEqual(
    expect.objectContaining({ round: 1, cause: 'first', command: 'review first 1' }),
  );
});

test('it gives a review of an item with no pull request no command, and asks the gate for none', () => {
  const ctx = setupTest();

  const input = ctx.review.input({
    item: buildMockV1ItemView(),
    attempt: buildMockV1AttemptRow().id,
    history: [buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 1000 })],
    retries: [],
    pullRequests: [],
    session: null,
  });

  expect(input).toStrictEqual({ pullRequest: null, round: 1, cause: 'first', command: null });
  expect(ctx.buildCommand).not.toHaveBeenCalled();
});

test('it reads the close-out that the server built from the gate reading', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();

  const closeOut = {
    round: 2,
    cause: 'rework',
    reading: buildMockGateReading({ status: 'blocked', why: 'open-findings' }),
    unrelatedLines: 6,
  };

  const parsed: unknown = ctx.review.closeOut.parse(closeOut, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({ kind: 'valid', closeOut });
});

test('it rejects a raw review result in place of the built close-out', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();

  const parsed = ctx.review.closeOut.parse(
    { review: { head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290' }, findings: { exitCode: 0 } },
    {
      item,
      attempt: buildMockV1AttemptRow().id,
      evidence: [],
      world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
      input: null,
    },
  );

  expect(parsed.kind).toBe('invalid');
});

test('it rejects a verdict of the session in the form of a v1 review close-out', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();

  const parsed = ctx.review.closeOut.parse(
    {
      verdict: { kind: 'passed' },
      noslop: {
        version: 7,
        reviewID: 'review-3c9a',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
        reportBytes: 2,
        report: {},
      },
      friction: [],
      frictionDropped: 0,
    },
    {
      item,
      attempt: buildMockV1AttemptRow().id,
      evidence: [],
      world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
      input: null,
    },
  );

  expect(parsed.kind).toBe('invalid');
});

test.each([
  {
    title: 'a passed reading',
    reading: buildMockGateReading({ status: 'passed' }),
    expected: { state: 'succeeded', failure: null, outcome: 'passed' },
  },
  {
    title: 'a reading blocked on open findings',
    reading: buildMockGateReading({ status: 'blocked', why: 'open-findings' }),
    expected: { state: 'succeeded', failure: null, outcome: 'changes-requested' },
  },
  {
    title: 'a reading blocked on a failed call',
    reading: buildMockGateReading({ status: 'blocked', why: 'failed-call' }),
    expected: { state: 'failed', failure: 'review-failed', outcome: 'failed' },
  },
  {
    title: 'an unreadable reading',
    reading: buildMockGateReading({ status: 'blocked', why: 'unreadable' }),
    expected: { state: 'failed', failure: 'review-failed', outcome: 'failed' },
  },
  {
    title: 'a reading that covers no head',
    reading: buildMockGateReading({ status: 'not-covered' }),
    expected: { state: 'failed', failure: 'review-failed', outcome: 'failed' },
  },
])('it settles $title', (row) => {
  const ctx = setupTest();

  const settlement: unknown = ctx.review.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('review') }),
    item: buildMockV1ItemView(),
    closeOut: { round: 1, cause: 'first', reading: row.reading, unrelatedLines: null },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({ ...row.expected, effects: [], frictionDropped: 0 });
});
