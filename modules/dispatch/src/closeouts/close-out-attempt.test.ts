import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { closeOutAttempt } from './close-out-attempt.ts';
import { settleAttempt } from './settle-attempt.ts';
import type { CallRef } from './types.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const claimAt = async (phase: string) => {
    const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse(phase) });
    const claim = await dispatch.claim();

    invariant(claim?.attempt.item === item, `the claim picks the seeded ${phase} item`);

    return dispatch.readAttempt(claim.attempt.id);
  };

  return {
    ...dispatch,
    claimDesign: () => claimAt('design'),
    claimReview: () => claimAt('review'),
    closeOut: (attempt: AttemptRow, body: unknown) =>
      closeOutAttempt({
        store: dispatch.store,
        call: dispatch.buildCallRef(attempt),
        body,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    closeOutAs: (call: CallRef, body: unknown) =>
      closeOutAttempt({
        store: dispatch.store,
        call,
        body,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
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
  };
}

test('it records the first valid close-out and moves the attempt to closing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  const answer = await ctx.closeOut(attempt, {
    result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
    friction: [],
  });

  const [fact] = await ctx.listFacts('boxxy.attempt.closed_out');
  const after = await ctx.readAttempt(attempt.id);

  invariant(fact !== undefined, 'the close-out fact is stored');

  expect(answer).toStrictEqual({
    kind: 'recorded',
    attempt: attempt.id,
    factId: fact.factId,
    repeat: false,
  });

  expect([after.state, after.closing]).toStrictEqual(['closing', 'closed-out']);
});

test('it answers the same body again as a repeat with the first fact and writes nothing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  const body = {
    result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
    friction: [],
  };

  const first = await ctx.closeOut(attempt, body);
  const repeat = await ctx.closeOut(attempt, body);
  const closedOut = await ctx.listFacts('boxxy.attempt.closed_out');

  invariant(first.kind === 'recorded', 'the first close-out records');

  expect(repeat).toStrictEqual({ ...first, repeat: true });
  expect(closedOut).toHaveLength(1);
});

test('it refuses a different body after the first close-out as already closed out', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  await ctx.closeOut(attempt, {
    result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
    friction: [],
  });

  const answer = await ctx.closeOut(attempt, {
    result: { kind: 'blocked', reason: 'The theme needs a decision.' },
    friction: [],
  });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'already-closed-out' });
});

test('it rejects an invalid close-out with its problems and leaves the attempt running', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();
  const answer = await ctx.closeOut(attempt, { result: { kind: 'finished' }, friction: [] });
  const after = await ctx.readAttempt(attempt.id);

  expect(answer).toMatchObject({ kind: 'rejected', problems: [{ kind: 'schema' }] });
  expect(after.state).toBe('running');
});

test('it rejects a body with no canonical JSON form, and writes nothing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  const answer = await ctx.closeOut(attempt, {
    result: { kind: 'blocked', reason: '\uD800' },
    friction: [],
  });

  const closedOut = await ctx.listFacts('boxxy.attempt.closed_out');

  expect(answer).toMatchObject({ kind: 'rejected', problems: [{ kind: 'schema' }] });
  expect(closedOut).toHaveLength(0);
});

test('it refuses a close-out of an attempt closing by another cause as not current', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  await ctx.closeItem(attempt.item, 'no longer wanted');

  const answer = await ctx.closeOut(attempt, {
    result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
    friction: [],
  });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'not-current' });
});

test('it refuses another body for a settled attempt as not current', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  await ctx.closeOut(attempt, {
    result: { kind: 'designed', design: { text: 'Follow the system theme.', location: null } },
    friction: [],
  });

  await ctx.settle(attempt);

  const answer = await ctx.closeOut(attempt, {
    result: { kind: 'abandoned', reason: 'Another item covers it.' },
    friction: [],
  });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'not-current' });
});

test('it refuses a call from a session that boxxy never started as no attempt', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimDesign();

  const answer = await ctx.closeOutAs(
    {
      attempt: attempt.id,
      session: brandSchemas.atcSessionId.parse('atc-unknown'),
      caller: { issuer: 'fake-worker', subject: 'atc-unknown' },
    },
    { result: { kind: 'abandoned', reason: 'Another item covers it.' }, friction: [] },
  );

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'no-attempt' });
});

test('it writes nothing when the close-out of the first attempt arrives again after its session was resumed', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  const call = ctx.buildCallRef(rework.first);

  const replay = await ctx.closeOutAs(call, rework.firstBody);

  const foreign = await ctx.closeOutAs(
    {
      ...call,
      attempt: rework.second.id,
      session: brandSchemas.atcSessionId.parse('atc-unknown'),
    },
    rework.firstBody,
  );

  const second = await ctx.readAttempt(rework.second.id);
  const closedOut = await ctx.listFacts('boxxy.attempt.closed_out');

  const received: unknown = [rework.second.atcSession, replay, foreign.kind];

  expect(received).toStrictEqual([
    rework.first.atcSession,
    { kind: 'refused', reason: 'not-current' },
    'refused',
  ]);

  expect([second.state, second.closeOutHash]).toStrictEqual(['running', null]);
  expect(closedOut).toHaveLength(2);
});

test('it rejects a close-out that is too large as stored, and leaves the attempt open', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimReview();

  const findingPaths = Array.from(
    { length: 32 },
    (_unused, index) => `${index}${'"'.repeat(1900)}`,
  );

  const answer = await ctx.closeOut(attempt, {
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({ status: 'blocked', why: 'open-findings', findingPaths }),
    unrelatedLines: null,
  });

  const after = await ctx.readAttempt(attempt.id);
  const closedOut = await ctx.listFacts('boxxy.attempt.closed_out');

  expect(answer).toMatchObject({
    kind: 'rejected',
    problems: [{ kind: 'too-large', max: 120_000 }],
  });

  expect(after.state).toBe('running');
  expect(closedOut).toHaveLength(0);
});
