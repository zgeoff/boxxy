import { expect, test } from 'bun:test';
import type { Friction } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';
import { verify } from './verify.ts';

test('it gives a verify the pull request, the head its review passed, and the recipe grader', () => {
  const head = brandSchemas.commitSha.parse('3f2a91c0d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9');
  const pullRequest = buildMockV1PullRequestRow();

  const input = verify.input({
    item: buildMockV1ItemView(),
    attempt: buildMockV1AttemptRow().id,
    history: [
      buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 1000 }),
      buildMockSettledAttemptRow({
        phase: 'review',
        outcome: 'passed',
        endedAt: 2000,
        closeOut: {
          round: 1,
          cause: 'first',
          reading: buildMockGateReading({ status: 'passed', head }),
          unrelatedLines: null,
        },
      }),
    ],
    retries: [],
    pullRequests: [pullRequest],
    session: 'builder',
  });

  expect(input).toStrictEqual({
    pullRequest: { repo: pullRequest.repo, number: pullRequest.number, url: pullRequest.url },
    head,
    session: 'builder',
  });
});

test('it gives a verify with no passed review no head, and a fresh grader when the recipe names none', () => {
  const input = verify.input({
    item: buildMockV1ItemView(),
    attempt: buildMockV1AttemptRow().id,
    history: [
      buildMockSettledAttemptRow({
        phase: 'review',
        outcome: 'changes-requested',
        endedAt: 2000,
        closeOut: {
          round: 1,
          cause: 'first',
          reading: buildMockGateReading({ status: 'blocked', why: 'open-findings' }),
          unrelatedLines: null,
        },
      }),
    ],
    retries: [],
    pullRequests: [],
    session: null,
  });

  expect(input).toStrictEqual({ pullRequest: null, head: null, session: 'fresh' });
});

test('it copies the grader from the attempt input into the close-out', () => {
  const item = buildMockV1ItemView();
  const raw = { result: { kind: 'verified' }, friction: [] };

  const parsed: unknown = verify.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: { pullRequest: null, head: null, session: 'builder' },
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: {
      result: { kind: 'verified' },
      session: 'builder',
      friction: [],
      frictionDropped: 0,
    },
  });
});

test('it rejects a close-out that names its own grader', () => {
  const item = buildMockV1ItemView();

  const parsed = verify.closeOut.parse(
    { result: { kind: 'verified' }, session: 'builder', friction: [] },
    {
      item,
      attempt: buildMockV1AttemptRow().id,
      evidence: [],
      world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
      input: { pullRequest: null, head: null, session: 'fresh' },
    },
  );

  expect(parsed.kind).toBe('invalid');
});

test.each([
  ['verified', { kind: 'verified' }, 'succeeded', null],
  ['failed', { kind: 'failed', features: ['upload-retry'] }, 'succeeded', null],
  ['blocked', { kind: 'blocked', question: 'Which theme is the default?' }, 'failed', 'blocked'],
  ['abandoned', { kind: 'abandoned', reason: 'The harness never came up' }, 'failed', 'abandoned'],
] as const)('it settles a %s verify', (outcome, result, state, failure) => {
  const settlement: unknown = verify.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('verify') }),
    item: buildMockV1ItemView(),
    closeOut: { result, session: 'fresh', friction: [], frictionDropped: 0 },
    now: brandSchemas.instant.parse(5000),
  });

  expect(settlement).toStrictEqual({ state, failure, outcome, effects: [], frictionDropped: 0 });
});

test('it asks to record each friction entry of a verify as a proposal', () => {
  const friction: Friction = {
    target: { kind: 'skill', name: 'verify' },
    change: 'Say how to start the app',
  };

  const settlement = verify.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('verify') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'verified' },
      session: 'builder',
      friction: [friction],
      frictionDropped: 1,
    },
    now: brandSchemas.instant.parse(5000),
  });

  expect(settlement.effects).toStrictEqual([{ kind: 'record-proposal', friction }]);
});
