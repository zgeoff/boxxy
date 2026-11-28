import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { claimNextPick } from '../test-utils/claim-next-pick.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { startClaim } from './start-claim.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const claimStarted = async () => {
    const claim = await claimNextPick({
      store: dispatch.store,
      runner: dispatch.runner,
      rules: dispatch.rules(),
      now: dispatch.clock.now(),
      newId: dispatch.newId,
      backoff: dispatch.backoff,
      spawn: dispatch.spawn,
    });

    invariant(claim?.kind === 'start', 'the claim starts the seeded item');

    return claim;
  };

  return {
    ...dispatch,
    claimBuild: async () => {
      await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

      return claimStarted();
    },
    claimStarted,
    refuse: async (claim: Parameters<typeof startClaim>[0]['claim']) => {
      dispatch.worker.failNext('start', {
        kind: 'refused',
        cause: 'capacity',
        reason: 'no free slot',
      });

      await startClaim({
        store: dispatch.store,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        claim,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
      });
    },
    start: (claim: Parameters<typeof startClaim>[0]['claim']) =>
      startClaim({
        store: dispatch.store,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        claim,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
      }),
  };
}

test('it records the started session, its caller and its agent session', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  await ctx.start(claim);

  const after = await ctx.readAttempt(claim.attempt.id);
  const bound = await ctx.listFacts('boxxy.attempt.session_bound');

  const received: unknown = [after.state, after.atcSession, after.caller, bound.length];

  expect(received).toStrictEqual([
    'running',
    'atc-1',
    { issuer: 'fake-worker', subject: 'atc-1' },
    1,
  ]);
});

test('it clears the kept session and hands its agent session to the rework that wakes it', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();
  const reading = await ctx.worker.reconcile(first);

  invariant(reading.kind !== 'absent' && reading.agentSession !== null, 'the session is kept');

  const agentSession = reading.agentSession;

  const second = await ctx.seedReworkAfter(first);
  const item = await ctx.store.read((tx) => tx.readItem(second.item, ctx.clock.now(), ctx.rules()));
  const holder = await ctx.store.read((tx) => tx.findAttemptByAgentSession(agentSession));

  expect([item?.keptSession, holder]).toStrictEqual([null, second.id]);
});

test('it hands an unanswered spawn to the reconcile table', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', { kind: 'unknown', reason: 'socket closed' });

  await ctx.start(claim);

  const after = await ctx.readAttempt(claim.attempt.id);

  expect([after.state, after.atcSession]).toStrictEqual(['reconciling', null]);
});

test('it deletes the attempt of a spawn refused for capacity, and records the refusal and the settled fact', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  const refusal = {
    code: 'host_unavailable',
    problem: 'ram_budget_exceeded',
    message: 'not enough pages',
  };

  ctx.worker.failNext('start', {
    kind: 'refused',
    cause: 'capacity',
    reason: 'host_unavailable (ram_budget_exceeded): not enough pages',
    refusal,
  });

  await ctx.start(claim);

  const attempts = await ctx.listAttempts(claim.attempt.item);
  const refusals = await ctx.readCapacityRefusals();
  const settled = await ctx.listFacts('boxxy.attempt.settled');

  expect([attempts, refusals]).toStrictEqual([
    [],
    {
      latest: { attempt: claim.attempt.id, at: ctx.clock.now(), refusal },
      count: 1,
    },
  ]);

  expect(settled).toStrictEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        attempt: claim.attempt.id,
        failure: 'no-capacity',
        refusal,
      }),
    }),
  ]);
});

test('it holds the pool of a spawn refused for capacity back for 60 seconds', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', { kind: 'refused', cause: 'capacity', reason: 'no free slot' });

  await ctx.start(claim);

  const inside = brandSchemas.instant.parse(ctx.clock.now() + 59_999);
  const atEnd = brandSchemas.instant.parse(ctx.clock.now() + 60_000);

  expect([ctx.backoff.listHeld(inside), ctx.backoff.listHeld(atEnd)]).toStrictEqual([
    claim.attempt.pool === null ? [] : [claim.attempt.pool],
    [],
  ]);
});

test('it gives an item one attempt, numbered 1, after refusals for capacity and a spawn that starts', async () => {
  const ctx = await setupTest();
  const first = await ctx.claimBuild();

  await ctx.refuse(first);

  ctx.clock.advance(61_000);

  const second = await ctx.claimStarted();

  await ctx.refuse(second);

  ctx.clock.advance(61_000);

  const third = await ctx.claimStarted();

  await ctx.refuse(third);

  ctx.clock.advance(61_000);

  const fourth = await ctx.claimStarted();

  await ctx.start(fourth);

  const attempts = await ctx.listAttempts(first.attempt.item);
  const refusals = await ctx.readCapacityRefusals();

  expect([attempts.map((row) => [row.number, row.state]), refusals.count]).toStrictEqual([
    [[1, 'running']],
    0,
  ]);
});

test('it keeps the attempt of a spawn refused for another cause, with no refusal stored', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', {
    kind: 'refused',
    cause: 'other',
    reason: 'unknown_target: no such target',
    refusal: { code: 'unknown_target', problem: null, message: 'no such target' },
  });

  await ctx.start(claim);

  const after = await ctx.readAttempt(claim.attempt.id);
  const refusals = await ctx.readCapacityRefusals();

  expect([after.state, after.refusal, refusals.count]).toStrictEqual(['failed', null, 0]);
});

test('it settles a spawn refused for another cause as spawn-refused, with no backoff', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', { kind: 'refused', cause: 'other', reason: 'unknown target' });

  await ctx.start(claim);

  const after = await ctx.readAttempt(claim.attempt.id);

  expect([after.failure, ctx.backoff.listHeld(ctx.clock.now())]).toStrictEqual([
    'spawn-refused',
    [],
  ]);
});

test.each([
  ['capacity', 'host_unavailable: no free slot'],
  ['other', 'unknown_target: no such target'],
] as const)('it returns a spawn refused for %s, with its reason', async (cause, reason) => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', { kind: 'refused', cause, reason });

  const refusal = await ctx.start(claim);

  expect(refusal).toStrictEqual({
    kind: 'fault',
    fault: 'spawn-refused',
    attempt: claim.attempt.id,
    item: claim.attempt.item,
    cause,
    reason,
  });
});
