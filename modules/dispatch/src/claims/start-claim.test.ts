import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { claimNext } from './claim-next.ts';
import { startClaim } from './start-claim.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    claimBuild: async () => {
      await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

      const claim = await claimNext({
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
    { issuer: 'https://fake-worker.test', subject: 'atc-1' },
    1,
  ]);
});

test('it hands an unanswered spawn to the reconcile table', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', { kind: 'unknown', reason: 'socket closed' });

  await ctx.start(claim);

  const after = await ctx.readAttempt(claim.attempt.id);

  expect([after.state, after.atcSession]).toStrictEqual(['reconciling', null]);
});

test('it settles a spawn refused for capacity as no-capacity, and holds the pool back for 60 seconds', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimBuild();

  ctx.worker.failNext('start', { kind: 'refused', cause: 'capacity', reason: 'no free slot' });

  await ctx.start(claim);

  const after = await ctx.readAttempt(claim.attempt.id);

  const inside = brandSchemas.instant.parse(ctx.clock.now() + 59_999);
  const atEnd = brandSchemas.instant.parse(ctx.clock.now() + 60_000);

  expect([after.state, after.failure, after.outcome]).toStrictEqual([
    'failed',
    'no-capacity',
    'lost',
  ]);

  expect([ctx.backoff.listHeld(inside), ctx.backoff.listHeld(atEnd)]).toStrictEqual([
    [claim.attempt.pool],
    [],
  ]);
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
